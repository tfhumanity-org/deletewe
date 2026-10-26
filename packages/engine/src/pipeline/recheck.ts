import type { EngineContext } from '../context.ts';
import { EngineError } from '../errors.ts';
import { runScan } from './scan.ts';
import { createOperatorTask } from './tasks.ts';

export type RecheckResult =
  | { readonly kind: 'removed' }
  | { readonly kind: 'still_listed'; readonly reopened: boolean }
  | { readonly kind: 'skipped'; readonly reason: string };

/**
 * The loop the whole product exists for.
 *
 * Removal is only ever proved by a later scan finding nothing — never by a
 * broker's success page. A listing that comes back is a re-list, which reopens
 * the case and feeds the broker's measured re-list rate.
 */
export async function runRecheck(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; caseId: string; jobId?: string },
): Promise<RecheckResult> {
  const { memberId, dek, caseId } = params;
  const caseFile = await ctx.store.getCase(memberId, caseId);
  if (!caseFile) throw new EngineError('not_found', 'case not found');

  const definition = ctx.catalog.get(caseFile.brokerId);
  if (!definition) return { kind: 'skipped', reason: 'no_definition' };

  const listing = await ctx.store.getListing(memberId, dek, caseFile.listingId);
  if (!listing) return { kind: 'skipped', reason: 'no_listing' };

  const log = ctx.log.child({ brokerId: caseFile.brokerId, caseId, jobKind: 'recheck' });
  const seenBefore = listing.lastSeenAt;

  const outcome = await runScan(ctx, { memberId, dek, brokerId: caseFile.brokerId, jobId: params.jobId });
  if (outcome.skipped) return { kind: 'skipped', reason: outcome.skipped };

  const after = await ctx.store.getListing(memberId, dek, caseFile.listingId);
  const stillListed = after !== undefined && after.lastSeenAt > seenBefore;
  const now = ctx.ports.clock.now();
  const nextCheck = now + definition.relist.interval_days * 86_400_000;

  if (!stillListed) {
    const wasRemoved = caseFile.state === 'removed';
    await ctx.store.updateCase(memberId, caseId, {
      state: 'removed',
      outcome: 'removed',
      closedAt: wasRemoved ? undefined : now,
      nextCheckAt: nextCheck,
    });
    await ctx.store.setListingStatus(memberId, caseFile.listingId, 'removed');
    if (!wasRemoved) {
      await ctx.store.recordEvent({ memberId, caseId, type: 'listing_removed', actor: 'system' });
      log.info('recheck_removed');
    }
    return { kind: 'removed' };
  }

  // Still there. If we had previously recorded a removal, this is a re-list.
  if (caseFile.state === 'removed') {
    await ctx.store.updateCase(memberId, caseId, { state: 'relisted', outcome: null, closedAt: null });
    await ctx.store.setListingStatus(memberId, caseFile.listingId, 'relisted');
    await ctx.store.recordEvent({ memberId, caseId, type: 'listing_relisted', actor: 'system' });
    log.info('recheck_relisted');
    await reopen(ctx, params, nextCheck);
    return { kind: 'still_listed', reopened: true };
  }

  // Never removed in the first place. Retry up to a point, then ask a human.
  if (caseFile.attemptCount < 3) {
    log.info('recheck_still_listed_retrying', { attempt: caseFile.attemptCount });
    await reopen(ctx, params, nextCheck);
    return { kind: 'still_listed', reopened: true };
  }

  await ctx.store.updateCase(memberId, caseId, { state: 'needs_review', nextCheckAt: nextCheck });
  await createOperatorTask(ctx, {
    memberId,
    dek,
    caseId,
    kind: 'broker_broken',
    title: `${definition.name}: listing persists after ${caseFile.attemptCount} opt-out attempts`,
    instructions: 'The broker has not honoured repeated requests, or our procedure is not reaching the right record. Investigate before retrying.',
  });
  log.warn('recheck_exhausted', { attempts: caseFile.attemptCount });
  return { kind: 'still_listed', reopened: false };
}

async function reopen(
  ctx: EngineContext,
  params: { memberId: string; caseId: string },
  nextCheck: number,
): Promise<void> {
  const { memberId, caseId } = params;
  await ctx.store.updateCase(memberId, caseId, { state: 'queued', nextCheckAt: nextCheck });
  const caseFile = await ctx.store.getCase(memberId, caseId);
  const { id, created } = await ctx.store.createJob({
    memberId,
    caseId,
    kind: 'submit',
    idempotencyKey: `submit:${caseId}:${caseFile?.attemptCount ?? 0}`,
  });
  if (created) await ctx.ports.queue.enqueue({ jobId: id, kind: 'submit', memberId, caseId });
}
