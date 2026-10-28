import type { BrokerDefinition, Extractor } from '@deletewe/schema';
import type { EngineContext } from '../context.ts';
import { EngineError } from '../errors.ts';
import { bucketFor, scoreListing, type MatchBucket } from '../matcher.ts';
import { renderSearchUrl } from '../projection.ts';
import type { ElementSnapshot, PageHandle } from '../ports.ts';
import type { ListingSnapshot, MatchResult } from '../types.ts';
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

/** One result the broker returned, scored but not yet acted on. */
export interface ScanCandidate {
  readonly snapshot: ListingSnapshot;
  readonly url: string | undefined;
  readonly match: MatchResult;
  readonly bucket: MatchBucket;
}

/**
 * What a scan saw, before anything was written down.
 *
 * `probeScan` performs the fetch and the scoring and stops there, which makes
 * it safe to point at a live broker while verifying a definition: no listing
 * is stored, no case opened, no request sent. See
 * docs/playbook/adding-a-broker.md.
 */
export interface ScanProbe {
  readonly brokerId: string;
  readonly searchUrl: string | undefined;
  readonly status: number | undefined;
  readonly resultCount: number;
  readonly candidates: readonly ScanCandidate[];
  readonly driver: string;
  readonly screenshot: Uint8Array | undefined;
  readonly skipped?: ScanOutcome['skipped'];
}

/**
 * Finds candidate listings for one member at one broker, scores them, and
 * routes each to auto-confirm, member review, or the bin.
 *
 * Nothing here submits anything. Scanning and submitting are separated by the
 * consent gate on purpose: see docs/product-spec.md section 4.2.
 */
export async function runScan(ctx: EngineContext, params: ScanParams): Promise<ScanOutcome> {
  const probe = await probeScan(ctx, params, { captureEvidence: true });
  if (probe.skipped) return empty(params.brokerId, probe.skipped);

  const definition = ctx.catalog.get(params.brokerId);
  if (!definition) throw new EngineError('not_found', `no definition for broker ${params.brokerId}`);

  const outcome = await ingest(ctx, params, definition, probe.candidates);
  ctx.log.child({ brokerId: params.brokerId, jobKind: 'scan' }).info('scan_complete', {
    candidates: outcome.candidates,
    autoConfirmed: outcome.autoConfirmed,
    queuedForReview: outcome.queuedForReview,
    discarded: outcome.discarded,
  });
  return outcome;
}

/**
 * The read half of a scan: fetch the broker's search surface, extract each
 * result per the definition, and score it. Writes nothing about the member.
 *
 * `runScan` builds on this; `explainScan` uses it on its own to verify a
 * definition against a live site without acting on what it finds.
 */
export async function probeScan(
  ctx: EngineContext,
  params: ScanParams,
  options: { captureEvidence?: boolean } = {},
): Promise<ScanProbe> {
  const { memberId, dek, brokerId } = params;
  const log = ctx.log.child({ brokerId, jobKind: 'scan' });
  const blank = (skipped: ScanOutcome['skipped']): ScanProbe => ({
    brokerId,
    searchUrl: undefined,
    status: undefined,
    resultCount: 0,
    candidates: [],
    driver: ctx.ports.browser.kind,
    screenshot: undefined,
    skipped,
  });

  if (!(await ctx.store.hasConsent(memberId, 'process_pii'))) {
    throw new EngineError('consent_missing', 'member has not consented to processing');
  }

  const definition = ctx.catalog.get(brokerId);
  if (!definition) throw new EngineError('not_found', `no definition for broker ${brokerId}`);
  const definitionSha = ctx.catalog.sha256(brokerId) ?? null;

  const brokerRow = await ctx.store.getBroker(brokerId);
  if (!definition.enabled || (brokerRow && (!brokerRow.enabled || !dispatchAllowed(brokerRow.status)))) {
    return blank('broker_unavailable');
  }

  if (definition.search.method === 'none') {
    if (options.captureEvidence) await ensureNoSearchTask(ctx, params, definition);
    return blank('no_search');
  }

  const profile = await ctx.store.loadProfile(memberId, dek);
  if (profile.names.length === 0) return blank('no_profile');

  const allowed = await ctx.store.tryConsumeRate(
    brokerId,
    definition.rate_limit.min_interval_ms,
    definition.rate_limit.daily_cap,
  );
  if (!allowed) {
    log.debug('scan_rate_limited');
    return blank('rate_limited');
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
      // Zero results is ambiguous: the member may simply not be listed, or
      // the page may have changed so our result selector matches nothing.
      // Only a `page_marker` can tell those apart — deriving a container from
      // the result selector cannot, because most are a single token and the
      // check then just re-asks the question it is trying to answer.
      const marker = definition.search.page_marker;
      if (marker && !(await page.querySelector(marker))) {
        await recordFailure(ctx, brokerId, 'selector_missing', 'search', definitionSha ?? '');
        log.warn('scan_page_marker_missing');
        return blank('broker_unavailable');
      }
      if (!marker) {
        log.debug('scan_empty_no_page_marker');
      }
    }

    const now = ctx.ports.clock.now();
    const member = await ctx.store.getMemberRow(memberId);
    const autoThreshold = member?.auto_confirm_threshold ?? 1.1;

    const candidates: ScanCandidate[] = results.map((element) => {
      const snapshot = extractSnapshot(definition, element);
      const match = scoreListing(profile, snapshot, definition.match, now);
      return {
        snapshot,
        url: absolute(snapshot.url, definition),
        match,
        bucket: bucketFor(match, definition.match.thresholds, autoThreshold),
      };
    });

    await recordSuccess(ctx, brokerId, definitionSha ?? '');

    const screenshot = ctx.ports.browser.canScreenshot ? await page.screenshot() : undefined;

    if (options.captureEvidence) {
      if (definition.evidence.capture.includes('transcript')) {
        await captureText(
          ctx,
          evidenceParams,
          'transcript',
          transcript.toJson({ brokerId, kind: 'scan', candidates: candidates.length }),
          'json',
        );
      }
      if (definition.evidence.capture.includes('screenshot') && screenshot) {
        await capture(ctx, evidenceParams, 'screenshot', screenshot, 'png');
      }
    }

    return {
      brokerId,
      searchUrl: url,
      status: page.status(),
      resultCount: results.length,
      candidates,
      driver: ctx.ports.browser.kind,
      screenshot,
    };
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
  candidates: readonly ScanCandidate[],
): Promise<ScanOutcome> {
  const { memberId, dek, brokerId } = params;

  let autoConfirmed = 0;
  let queuedForReview = 0;
  let discarded = 0;

  for (const candidate of candidates) {
    const { snapshot, url: listingUrl, match: result, bucket } = candidate;
    if (!listingUrl) {
      discarded++;
      continue;
    }

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

  return { brokerId, candidates: candidates.length, autoConfirmed, queuedForReview, discarded };
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
  const target =
    extractor.selector === 'self' || extractor.selector === ':scope' ? element : element.find(extractor.selector);
  if (!target) return undefined;

  const raw =
    extractor.attr === 'text'
      ? target.text
      : extractor.attr === 'html'
        ? target.html
        : target.attrs[extractor.attr];
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
