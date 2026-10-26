import type { HandoffReason } from '@deletewe/schema';
import type { EngineContext } from '../context.ts';
import type { TaskKind } from '../types.ts';

const TASK_TITLES: Readonly<Record<TaskKind, string>> = {
  captcha: 'Finish a step we will not automate',
  id_upload: 'Upload your ID directly to the broker',
  phone_call: 'Make a short phone call',
  confirm_match: 'Is this listing you?',
  broker_broken: 'Broker flow needs repair',
  verify_ambiguous: 'Confirmation email needs a human',
  manual_optout: 'Manual opt-out needed',
  drop_unavailable: 'Submit a DROP request yourself',
};

const HANDOFF_TASK_KIND: Readonly<Record<HandoffReason, TaskKind>> = {
  captcha: 'captcha',
  id_upload: 'id_upload',
  phone_call: 'phone_call',
  payment_wall: 'manual_optout',
  account_creation: 'manual_optout',
  unexpected: 'manual_optout',
};

export function taskKindForHandoff(reason: HandoffReason): TaskKind {
  return HANDOFF_TASK_KIND[reason];
}

export interface GuidedTaskParams {
  readonly memberId: string;
  readonly dek: Uint8Array;
  readonly caseId: string | null;
  readonly kind: TaskKind;
  readonly brokerName: string;
  readonly instructions: string;
  /** Values for the member to paste. Encrypted at rest, shown only to them. */
  readonly prefill?: Record<string, string>;
  readonly deepLink?: string;
  readonly dueInHours?: number;
}

/**
 * Human involvement is a pipeline state available to every member, not a
 * premium tier. See docs/adr/0005-human-in-the-loop.md.
 *
 * The task row carries no PII in its title or instructions — values the member
 * needs are in `prefill`, encrypted with their own key.
 */
export async function createGuidedTask(ctx: EngineContext, params: GuidedTaskParams): Promise<string> {
  const now = ctx.ports.clock.now();
  const id = await ctx.store.createTask({
    memberId: params.memberId,
    dek: params.dek,
    caseId: params.caseId,
    audience: 'member',
    kind: params.kind,
    title: `${TASK_TITLES[params.kind]} — ${params.brokerName}`,
    instructions: params.instructions,
    prefill: params.prefill ?? null,
    deepLink: params.deepLink ?? null,
    dueAt: params.dueInHours ? now + params.dueInHours * 3600_000 : null,
  });
  ctx.log.info('task_created', { kind: params.kind, audience: 'member', caseId: params.caseId });
  return id;
}

export async function createOperatorTask(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; caseId: string | null; kind: TaskKind; title: string; instructions: string },
): Promise<string> {
  const id = await ctx.store.createTask({
    memberId: params.memberId,
    dek: params.dek,
    caseId: params.caseId,
    audience: 'operator',
    kind: params.kind,
    title: params.title,
    instructions: params.instructions,
    prefill: null,
    deepLink: null,
    dueAt: null,
  });
  ctx.log.info('task_created', { kind: params.kind, audience: 'operator', caseId: params.caseId });
  return id;
}
