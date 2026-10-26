import type { BrokerDefinition, Extractor } from '@deletewe/schema';
import type { EngineContext } from '../context.ts';
import { EngineError } from '../errors.ts';
import { bucketFor, scoreListing } from '../matcher.ts';
import { renderSearchUrl } from '../projection.ts';
import type { ElementSnapshot, PageHandle } from '../ports.ts';
import type { ListingSnapshot, Profile } from '../types.ts';
import { capture, captureText, Transcript } from './evidence.ts';
import { dispatchAllowed, recordFailure, recordSuccess } from './health.ts';
import { createGuidedTask } from './tasks.ts';

export interface ScanOutcome {
  readonly brokerId: string;
  readonly candidates: number;
  readonly autoConfirmed: number;
  readonly queuedForReview: number;
  readonly discarded: number;
  readonly skipped?: 'rate_limited' | 'broker_unavailable' | 'no_search' | 'no_profile';
}

export interface ScanParams {
  readonly memberId: string;
  readonly dek: Uint8Array;
  readonly brokerId: string;
  readonly jobId?: string;
}

/**
 * Finds candidate listings for one member at one broker, scores them, and
 * routes each to auto-confirm, member review, or the bin.
 *
 * Nothing here submits anything. Scanning and submitting are separated by the
 * consent gate on purpose: see docs/product-spec.md section 4.2.
 */
export async function runScan(ctx: EngineContext, params: ScanParams): Promise<ScanOutcome> {
  const { memberId, dek, brokerId } = params;
  const log = ctx.log.child({ brokerId, jobKind: 'scan' });

  if (!(await ctx.store.hasConsent(memberId, 'process_pii'))) {
    throw new EngineError('consent_missing', 'member has not consented to processing');
  }

  const definition = ctx.catalog.get(brokerId);
  if (!definition) throw new EngineError('not_found', `no definition for broker ${brokerId}`);
  const definitionSha = ctx.catalog.sha256(brokerId) ?? null;

  const brokerRow = await ctx.store.getBroker(brokerId);
  if (!definition.enabled || (brokerRow && (!brokerRow.enabled || !dispatchAllowed(brokerRow.status)))) {
    return empty(brokerId, 'broker_unavailable');
  }

  if (definition.search.method === 'none') {
    // Nothing to search. Brokers like these are handled by a standing
    // instruction to the member rather than by pretending to cover them.
    await ensureNoSearchTask(ctx, params, definition);
    return empty(brokerId, 'no_search');
  }

  const profile = await ctx.store.loadProfile(memberId, dek);
  if (profile.names.length === 0) return empty(brokerId, 'no_profile');

  const allowed = await ctx.store.tryConsumeRate(
    brokerId,
    definition.rate_limit.min_interval_ms,
    definition.rate_limit.daily_cap,
  );
  if (!allowed) {
    log.debug('scan_rate_limited');
    return empty(brokerId, 'rate_limited');
  }

  const url = renderSearchUrl(definition.search.url_template, profile);
  const transcript = new Transcript(() => ctx.ports.clock.now());
  const evidenceParams = {
    memberId,
    dek,
    caseId: null,
    jobId: params.jobId ?? null,
    brokerId,
    definitionSha256: definitionSha,
  };

  let page: PageHandle | undefined;
  try {
    page = await ctx.ports.browser.open(url, {
      allowedHosts: definition.hosts,
      userAgent: ctx.config.userAgent,
      timeoutMs: ctx.config.browserTimeoutMs,
    });
    transcript.add({ step: 'search', action: 'goto', url, status: page.status(), ok: true });

    const results = await page.queryAll(definition.search.result_selector);
    if (results.length === 0) {
      // No results is a legitimate outcome, not a breakage — but an empty page
      // where the result container itself is gone is a selector problem.
      const container = await page.querySelector(definition.search.result_selector.split(' ')[0] ?? 'body');
      if (!container) {
        await recordFailure(ctx, brokerId, 'selector_missing', 'search', definitionSha ?? '');
        log.warn('scan_selector_missing');
        return empty(brokerId, 'broker_unavailable');
      }
    }

    const outcome = await ingest(ctx, params, definition, profile, results);
    await recordSuccess(ctx, brokerId, definitionSha ?? '');

    if (definition.evidence.capture.includes('transcript')) {
      await captureText(
        ctx,
        evidenceParams,
        'transcript',
        transcript.toJson({ brokerId, kind: 'scan', candidates: outcome.candidates }),
        'json',
      );
    }
    if (definition.evidence.capture.includes('screenshot') && ctx.ports.browser.canScreenshot) {
      const shot = await page.screenshot();
      if (shot) await capture(ctx, evidenceParams, 'screenshot', shot, 'png');
    }

    log.info('scan_complete', {
      candidates: outcome.candidates,
      autoConfirmed: outcome.autoConfirmed,
      queuedForReview: outcome.queuedForReview,
      discarded: outcome.discarded,
    });
    return outcome;
  } catch (error) {
    const kind = error instanceof EngineError && error.code === 'host_not_allowlisted' ? 'host_not_allowlisted' : 'timeout';
    await recordFailure(ctx, brokerId, kind, 'search', definitionSha ?? '');
    throw error;
  } finally {
    await page?.close();
  }
}

async function ingest(
  ctx: EngineContext,
  params: ScanParams,
  definition: BrokerDefinition,
  profile: Profile,
  results: readonly ElementSnapshot[],
): Promise<ScanOutcome> {
  const { memberId, dek, brokerId } = params;
  const now = ctx.ports.clock.now();
  const member = await ctx.store.getMemberRow(memberId);
  const autoThreshold = member?.auto_confirm_threshold ?? 1.1;

  let autoConfirmed = 0;
  let queuedForReview = 0;
  let discarded = 0;

  for (const element of results) {
    const snapshot = extractSnapshot(definition, element);
    const listingUrl = absolute(snapshot.url, definition);
    if (!listingUrl) {
      discarded++;
      continue;
    }

    const result = scoreListing(profile, snapshot, definition.match, now);
    const bucket = bucketFor(result, definition.match.thresholds, autoThreshold);

    if (bucket === 'discard') {
      // Deliberately not persisted: a listing we judged is not ours is a
      // stranger's data, and keeping it would be the harm we exist to prevent.
      discarded++;
      continue;
    }

    const dedupHash = await ctx.store.dedupHash(brokerId, snapshot['externalKey'] ?? listingUrl);
    const { id: listingId } = await ctx.store.upsertListing({
      memberId,
      dek,
      brokerId,
      url: listingUrl,
      externalKey: snapshot['externalKey'] ?? null,
      snapshot,
      dedupHash,
    });

    const existingCase = await ctx.store.getCaseByListing(memberId, listingId);
    if (existingCase && existingCase.state !== 'discovered' && existingCase.state !== 'rejected') {
      // Already in flight or already resolved; the re-check path owns it.
      continue;
    }

    if (bucket === 'auto_confirm') {
      await ctx.store.recordMatch({ memberId, dek, listingId, result, decision: 'auto_confirmed', decidedBy: 'auto' });
      await ctx.store.setListingStatus(memberId, listingId, 'queued');
      const caseId = await ctx.store.openCase({ memberId, brokerId, listingId, state: 'queued' });
      await ctx.store.updateCase(memberId, caseId, { state: 'queued' });
      await enqueueSubmit(ctx, memberId, caseId);
      autoConfirmed++;
    } else {
      await ctx.store.recordMatch({ memberId, dek, listingId, result, decision: 'pending' });
      await ctx.store.setListingStatus(memberId, listingId, 'awaiting_consent');
      const caseId = await ctx.store.openCase({ memberId, brokerId, listingId, state: 'awaiting_consent' });
      await ctx.store.updateCase(memberId, caseId, { state: 'awaiting_consent' });
      await createGuidedTask(ctx, {
        memberId,
        dek,
        caseId,
        kind: 'confirm_match',
        brokerName: definition.name,
        instructions:
          'We found a listing that may be you. Check the details against your profile and tell us whether to ask for its removal. We will not contact this broker until you say so.',
        deepLink: `${ctx.config.baseUrl}/listings/${listingId}`,
      });
      queuedForReview++;
    }
  }

  return { brokerId, candidates: results.length, autoConfirmed, queuedForReview, discarded };
}

export async function enqueueSubmit(ctx: EngineContext, memberId: string, caseId: string): Promise<void> {
  const caseFile = await ctx.store.getCase(memberId, caseId);
  const attempt = caseFile?.attemptCount ?? 0;
  const { id, created } = await ctx.store.createJob({
    memberId,
    caseId,
    kind: 'submit',
    idempotencyKey: `submit:${caseId}:${attempt}`,
  });
  if (created) await ctx.ports.queue.enqueue({ jobId: id, kind: 'submit', memberId, caseId });
}

function extractSnapshot(definition: BrokerDefinition, element: ElementSnapshot): ListingSnapshot {
  if (definition.search.method !== 'url_template') return {};
  const snapshot: Record<string, string | undefined> = {};
  for (const [field, extractor] of Object.entries(definition.search.fields)) {
    const value = applyExtractor(element, extractor);
    if (value !== undefined) snapshot[field] = value;
  }
  return snapshot;
}

/**
 * Extraction runs against the already-fetched element. The `selector` scopes
 * within the result; `self` reads the result element itself.
 */
export function applyExtractor(element: ElementSnapshot, extractor: Extractor): string | undefined {
  const raw =
    extractor.attr === 'text'
      ? element.text
      : extractor.attr === 'html'
        ? element.html
        : element.attrs[extractor.attr];
  if (raw === undefined) return undefined;

  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return undefined;
  if (!extractor.pattern) return trimmed;

  try {
    const m = new RegExp(extractor.pattern).exec(trimmed);
    return m?.[1] ?? m?.[0];
  } catch {
    return trimmed;
  }
}

function absolute(url: string | undefined, definition: BrokerDefinition): string | undefined {
  if (!url) return undefined;
  try {
    const resolved = new URL(url, definition.homepage);
    if (resolved.protocol !== 'https:') return undefined;
    const host = resolved.hostname.toLowerCase();
    // A listing URL off the allowlist is not ours to follow.
    if (!definition.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

async function ensureNoSearchTask(ctx: EngineContext, params: ScanParams, definition: BrokerDefinition): Promise<void> {
  if (definition.automation.level === 'unsupported') return;
  const open = await ctx.store.listTasks(params.memberId, params.dek, 'member', 'open');
  if (open.some((t) => t.title.endsWith(definition.name))) return;

  await createGuidedTask(ctx, {
    memberId: params.memberId,
    dek: params.dek,
    caseId: null,
    kind: definition.opt_out.method === 'phone' ? 'phone_call' : 'manual_optout',
    brokerName: definition.name,
    instructions:
      definition.opt_out.instructions ??
      'This broker has no searchable index we can read, so we cannot confirm whether you are listed. Follow the broker’s own opt-out procedure.',
    deepLink: definition.opt_out.url ?? definition.homepage,
  });
}

function empty(brokerId: string, skipped: ScanOutcome['skipped']): ScanOutcome {
  return { brokerId, candidates: 0, autoConfirmed: 0, queuedForReview: 0, discarded: 0, skipped };
}
