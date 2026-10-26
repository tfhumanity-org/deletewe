import type { EngineContext } from '../context.ts';
import { EngineError } from '../errors.ts';
import { enqueueSubmit } from '../pipeline/scan.ts';
import type { FieldComparison, Listing } from '../types.ts';

export interface ReviewItem {
  readonly listing: Listing;
  readonly brokerName: string;
  readonly score: number;
  readonly comparisons: readonly FieldComparison[];
  readonly caseId: string;
  readonly matchId: string;
}

/** The member's review queue: listings we will not touch until they decide. */
export async function pendingReviews(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array },
): Promise<ReviewItem[]> {
  const listings = await ctx.store.listListings(params.memberId, params.dek);
  const brokers = new Map((await ctx.store.listBrokers()).map((b) => [b.id, b.name]));
  const out: ReviewItem[] = [];

  for (const listing of listings) {
    if (listing.status !== 'awaiting_consent') continue;
    const match = await ctx.store.latestMatch(params.memberId, params.dek, listing.id);
    if (!match || match.decision !== 'pending') continue;
    const caseFile = await ctx.store.getCaseByListing(params.memberId, listing.id);
    if (!caseFile) continue;

    out.push({
      listing,
      brokerName: brokers.get(listing.brokerId) ?? listing.brokerId,
      score: match.score,
      comparisons: match.comparisons,
      caseId: caseFile.id,
      matchId: match.id,
    });
  }
  return out;
}

/**
 * The consent gate in the member's hands.
 *
 * Confirming queues a submission. Rejecting records that this listing is not
 * them, closes the case, and keeps the rejection so the broker's weights can
 * be tuned — a false positive is the worst thing this system can do.
 */
export async function decideListing(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; listingId: string; confirm: boolean; decidedBy?: 'member' | 'operator' },
): Promise<{ caseId: string; queued: boolean }> {
  const listing = await ctx.store.getListing(params.memberId, params.dek, params.listingId);
  if (!listing) throw new EngineError('not_found', 'listing not found');

  const match = await ctx.store.latestMatch(params.memberId, params.dek, params.listingId);
  if (!match) throw new EngineError('not_found', 'no match recorded for this listing');

  const caseFile = await ctx.store.getCaseByListing(params.memberId, params.listingId);
  if (!caseFile) throw new EngineError('not_found', 'case not found');

  const decidedBy = params.decidedBy ?? 'member';
  await ctx.store.decideMatch(params.memberId, match.id, params.confirm ? 'confirmed' : 'rejected', decidedBy);

  await closeConfirmTask(ctx, params.memberId, params.dek, caseFile.id);

  if (!params.confirm) {
    await ctx.store.updateCase(params.memberId, caseFile.id, {
      state: 'rejected',
      outcome: 'abandoned',
      closedAt: ctx.ports.clock.now(),
      nextCheckAt: null,
    });
    await ctx.store.setListingStatus(params.memberId, params.listingId, 'rejected');
    await ctx.store.recordEvent({
      memberId: params.memberId,
      caseId: caseFile.id,
      type: 'listing_rejected_by_member',
      actor: decidedBy,
    });
    ctx.log.info('listing_rejected', { brokerId: listing.brokerId, score: match.score });
    return { caseId: caseFile.id, queued: false };
  }

  await ctx.store.updateCase(params.memberId, caseFile.id, { state: 'queued' });
  await ctx.store.setListingStatus(params.memberId, params.listingId, 'queued');
  await ctx.store.recordEvent({
    memberId: params.memberId,
    caseId: caseFile.id,
    type: 'listing_confirmed_by_member',
    actor: decidedBy,
  });
  await enqueueSubmit(ctx, params.memberId, caseFile.id);
  ctx.log.info('listing_confirmed', { brokerId: listing.brokerId, score: match.score });
  return { caseId: caseFile.id, queued: true };
}

async function closeConfirmTask(ctx: EngineContext, memberId: string, dek: Uint8Array, caseId: string): Promise<void> {
  const tasks = await ctx.store.listTasks(memberId, dek, 'member', 'open');
  for (const task of tasks) {
    if (task.caseId === caseId && task.kind === 'confirm_match') {
      await ctx.store.completeTask(memberId, task.id, 'done');
    }
  }
}

/**
 * The member reports a guided task done. We take their word for the action but
 * not for the outcome: the case advances to awaiting-verification or
 * acknowledged, and the re-check still has to prove removal.
 */
export async function completeGuidedTask(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; taskId: string; done: boolean },
): Promise<void> {
  const task = await ctx.store.getTask(params.memberId, params.dek, params.taskId);
  if (!task) throw new EngineError('not_found', 'task not found');
  if (task.audience !== 'member') throw new EngineError('forbidden', 'that task is not yours to complete');

  await ctx.store.completeTask(params.memberId, params.taskId, params.done ? 'done' : 'skipped');

  if (!task.caseId) return;
  const caseFile = await ctx.store.getCase(params.memberId, task.caseId);
  if (!caseFile || caseFile.state !== 'task_pending') return;

  const now = ctx.ports.clock.now();
  if (!params.done) {
    await ctx.store.updateCase(params.memberId, task.caseId, { state: 'needs_review' });
    return;
  }

  const definition = ctx.catalog.get(caseFile.brokerId);
  const awaiting = definition ? definition.verification.method !== 'none' : false;
  const state = awaiting ? 'awaiting_verification' : 'acknowledged';

  await ctx.store.updateCase(params.memberId, task.caseId, {
    state,
    nextCheckAt: now + ctx.config.removalGraceDays * 86_400_000,
  });
  await ctx.store.setListingStatus(params.memberId, caseFile.listingId, state);
  await ctx.store.recordEvent({
    memberId: params.memberId,
    caseId: task.caseId,
    type: 'guided_task_completed',
    actor: 'member',
  });
}
