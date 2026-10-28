import type { EngineContext } from '../context.ts';
import {
  dropTimeline,
  isDropEligible,
  normaliseDropReference,
  type DropRequestState,
  type DropStep,
} from '../drop.ts';
import { EngineError } from '../errors.ts';

export interface DropOverview {
  readonly eligible: boolean;
  readonly state: DropRequestState;
  readonly reference: string | null;
  readonly submittedAt: number | null;
  readonly brokersMustRetrieveBy: number | null;
  readonly amendableFrom: number | null;
  readonly statusMeaningfulFrom: number | null;
  readonly steps: readonly DropStep[];
  readonly agentDisclosure: { fullName: string; email: string; tradeName?: string } | undefined;
}

/** What the member needs to see about their statutory request, in one call. */
export async function dropOverview(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array },
): Promise<DropOverview> {
  const row = await ctx.store.getMemberRow(params.memberId);
  if (!row) throw new EngineError('not_found', 'member not found');

  const eligible = isDropEligible(row.jurisdiction);
  const existing = await ctx.store.getDropRequest(params.memberId, params.dek);
  const { dropSteps } = await import('../drop.ts');

  return {
    eligible,
    state: existing?.state ?? 'not_started',
    reference: existing?.reference ?? null,
    submittedAt: existing?.submittedAt ?? null,
    brokersMustRetrieveBy: existing?.brokersMustRetrieveBy ?? null,
    amendableFrom: existing?.amendableFrom ?? null,
    statusMeaningfulFrom: existing?.statusMeaningfulFrom ?? null,
    steps: dropSteps(ctx.ports.drop.agent),
    agentDisclosure: ctx.ports.drop.agent,
  };
}

/**
 * The member has submitted their own DROP request and is telling us so.
 *
 * We take their word for the act — we could not have observed it — but not for
 * the outcome. What we do is start the statutory clock: brokers must retrieve
 * the request within 45 days (§ 7612(a)), and we schedule the re-checks that
 * turn that obligation into something anyone actually follows up.
 */
export async function recordDropSubmission(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; reference?: string; submittedAt?: number },
): Promise<{ timeline: ReturnType<typeof dropTimeline>; reference: string | null }> {
  const row = await ctx.store.getMemberRow(params.memberId);
  if (!row) throw new EngineError('not_found', 'member not found');
  if (!isDropEligible(row.jurisdiction)) {
    throw new EngineError('invalid_input', 'DROP covers California residents only');
  }

  const submittedAt = params.submittedAt ?? ctx.ports.clock.now();
  if (submittedAt > ctx.ports.clock.now() + 86_400_000) {
    throw new EngineError('invalid_input', 'that submission date is in the future');
  }

  // A mistyped reference is worse than none: it looks like a record and is not.
  const reference = params.reference ? normaliseDropReference(params.reference) : undefined;
  if (params.reference && !reference) {
    throw new EngineError('invalid_input', 'that does not look like a DROP reference number');
  }

  await ctx.store.recordDropSubmission({
    memberId: params.memberId,
    dek: params.dek,
    caseId: null,
    reference: reference ?? null,
    submittedAt,
    agent: ctx.ports.drop.agent
      ? { fullName: ctx.ports.drop.agent.fullName, email: ctx.ports.drop.agent.email }
      : undefined,
  });

  const timeline = dropTimeline(submittedAt);

  // Advance the catalogue case for the statutory channel in step with it, so
  // the dashboard tells one story rather than two.
  for (const caseFile of await ctx.store.listCases(params.memberId)) {
    if (caseFile.brokerId !== 'california-drop') continue;
    await ctx.store.updateCase(params.memberId, caseFile.id, {
      state: 'acknowledged',
      nextCheckAt: timeline.brokersMustRetrieveBy,
    });
    await ctx.store.setListingStatus(params.memberId, caseFile.listingId, 'acknowledged');
  }

  await ctx.store.recordEvent({
    memberId: params.memberId,
    type: 'drop_request_submitted',
    actor: 'member',
  });
  ctx.log.info('drop_submission_recorded', { hasReference: reference !== undefined });

  return { timeline, reference: reference ?? null };
}

/**
 * § 7621(c): an authorized agent may not cancel a consumer's deletion request
 * unless expressly directed by the consumer. So this exists, and only the
 * member can reach it.
 */
export async function cancelDropRequest(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array },
): Promise<void> {
  const existing = await ctx.store.getDropRequest(params.memberId, params.dek);
  if (!existing) throw new EngineError('not_found', 'no DROP request on record');

  // § 7620(d): not amendable or cancellable for the first 45 days.
  if (existing.amendableFrom !== null && ctx.ports.clock.now() < existing.amendableFrom) {
    throw new EngineError(
      'invalid_input',
      'a DROP request cannot be amended or cancelled until 45 days after it was submitted',
    );
  }

  await ctx.store.setDropState(params.memberId, 'cancelled', ctx.ports.clock.now());
  await ctx.store.recordEvent({ memberId: params.memberId, type: 'drop_request_cancelled', actor: 'member' });
}
