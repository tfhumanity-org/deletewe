import type { BrokerDefinition } from '@deletewe/schema';
import type { EngineContext } from '../context.ts';
import { captureText, type CaptureParams } from './evidence.ts';
import { createOperatorTask } from './tasks.ts';
import type { InboundMessage, PageHandle } from '../ports.ts';

export type VerifyResult =
  | { readonly kind: 'verified' }
  | { readonly kind: 'ignored'; readonly reason: string }
  | { readonly kind: 'needs_review'; readonly reason: string };

/**
 * Handles a broker's confirmation email.
 *
 * Most people-search opt-outs complete only when a link in an email is
 * clicked, often within about 24 hours, so this is the step that decides
 * whether the product actually works. See docs/research/03-removal-mechanics.md.
 *
 * It is also an attack surface: anyone can send us mail. Four checks gate it —
 * the inbound address must map to a live token, the sender must match the
 * definition's expected senders, the platform's authentication verdict must
 * not be a failure, and the link must match the definition's anchored pattern
 * on an allowlisted host.
 */
export async function handleInboundMessage(ctx: EngineContext, message: InboundMessage): Promise<VerifyResult> {
  const token = ctx.ports.inbound.tokenFrom(message.to);
  if (!token) return { kind: 'ignored', reason: 'unrecognised_recipient' };

  const record = await ctx.store.resolveVerificationToken(token);
  if (!record) return { kind: 'ignored', reason: 'unknown_token' };

  const log = ctx.log.child({ brokerId: record.brokerId, caseId: record.caseId, jobKind: 'verify' });

  if (record.consumedAt !== null) return { kind: 'ignored', reason: 'already_consumed' };
  if (record.expiresAt < ctx.ports.clock.now()) {
    log.warn('verification_window_expired');
    await ctx.store.updateCase(record.memberId, record.caseId, { state: 'needs_review' });
    return { kind: 'needs_review', reason: 'verification_expired' };
  }

  const definition = ctx.catalog.get(record.brokerId);
  if (!definition) return { kind: 'ignored', reason: 'unknown_broker' };

  if (message.authenticated === false) {
    log.warn('verification_sender_unauthenticated');
    return { kind: 'ignored', reason: 'sender_unauthenticated' };
  }
  if (!senderAccepted(message.from, definition)) {
    log.warn('verification_sender_rejected');
    return { kind: 'ignored', reason: 'sender_not_expected' };
  }

  const memberRow = await ctx.store.getMemberRow(record.memberId);
  if (!memberRow) return { kind: 'ignored', reason: 'member_gone' };
  const dek = await ctx.store.unwrapDekFor(memberRow);

  const evidence: CaptureParams = {
    memberId: record.memberId,
    dek,
    caseId: record.caseId,
    jobId: null,
    brokerId: record.brokerId,
    definitionSha256: ctx.catalog.sha256(record.brokerId) ?? null,
  };
  await captureText(ctx, evidence, 'email', message.raw, 'eml');

  const link = extractConfirmationLink(message.text, definition);
  if (!link) {
    await ctx.store.updateCase(record.memberId, record.caseId, { state: 'needs_review' });
    await createOperatorTask(ctx, {
      memberId: record.memberId,
      dek,
      caseId: record.caseId,
      kind: 'verify_ambiguous',
      title: `${definition.name}: confirmation email could not be parsed`,
      instructions: 'A message arrived for this case but no confirmation link matched the definition. Review the stored email evidence.',
    });
    ctx.log.warn('verification_unparseable', { brokerId: record.brokerId });
    return { kind: 'needs_review', reason: 'verification_unparseable' };
  }

  let page: PageHandle | undefined;
  try {
    page = await ctx.ports.browser.open(link, {
      allowedHosts: definition.hosts,
      userAgent: ctx.config.userAgent,
      timeoutMs: ctx.config.browserTimeoutMs,
    });
    await captureText(ctx, evidence, 'dom', await page.content(), 'html');
  } finally {
    await page?.close();
  }

  await ctx.store.consumeVerificationToken(token);
  const now = ctx.ports.clock.now();
  await ctx.store.updateCase(record.memberId, record.caseId, {
    state: 'acknowledged',
    nextCheckAt: now + ctx.config.removalGraceDays * 86_400_000,
  });
  const caseFile = await ctx.store.getCase(record.memberId, record.caseId);
  if (caseFile) await ctx.store.setListingStatus(record.memberId, caseFile.listingId, 'acknowledged');
  await ctx.store.recordEvent({
    memberId: record.memberId,
    caseId: record.caseId,
    type: 'optout_verified',
    actor: 'system',
  });

  log.info('verification_complete');
  return { kind: 'verified' };
}

export function senderAccepted(from: string, definition: BrokerDefinition): boolean {
  const sender = from.toLowerCase().trim();
  const address = /<([^>]+)>/.exec(sender)?.[1] ?? sender;
  return definition.verification.expected_senders.some((expected) => {
    const e = expected.toLowerCase();
    return e.startsWith('@') ? address.endsWith(e) : address === e;
  });
}

/**
 * Finds the confirmation link. The definition's pattern must match, and the
 * resolved host must be on the allowlist — a broker's email cannot redirect us
 * to an arbitrary endpoint. See docs/threat-model.md TB6.
 */
export function extractConfirmationLink(text: string, definition: BrokerDefinition): string | undefined {
  const pattern = definition.verification.link_pattern;
  if (!pattern) return undefined;

  let re: RegExp;
  try {
    re = new RegExp(pattern, 'g');
  } catch {
    return undefined;
  }

  for (const match of text.matchAll(re)) {
    const candidate = match[0];
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:') continue;
      const host = url.hostname.toLowerCase();
      if (definition.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return url.toString();
    } catch {
      continue;
    }
  }
  return undefined;
}
