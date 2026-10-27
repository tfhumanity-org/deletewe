import type { EngineContext } from '../context.ts';
import { codeOf, EngineError } from '../errors.ts';
import { redact } from '../logger.ts';
import type { JobMessage } from '../ports.ts';
import { runRecheck } from './recheck.ts';
import { runScan } from './scan.ts';
import { runSubmit } from './submit.ts';
import { generateReport } from '../reports.ts';

const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

/**
 * How long a claimed job may stay `running` before another delivery is allowed
 * to take it over. Longer than any single job should take; short enough that a
 * worker killed mid-run does not strand the case.
 */
const JOB_LEASE_MS = 60 * 60 * 1000;

/**
 * A re-check holds its case's timer for this long. If the re-check is skipped,
 * fails, or the worker dies, the timer has still moved forward rather than
 * being cleared, so `dueCases` finds the case again instead of losing it.
 */
const RECHECK_LEASE_MS = 6 * 60 * 60 * 1000;

/**
 * The cron sweep is a safety net for queue messages that never arrived, not
 * the primary dispatch path — the dispatcher enqueues its own retries. Only
 * jobs whose run_after is older than this are re-enqueued, so a job already in
 * flight is not delivered twice.
 */
const LOST_MESSAGE_MS = 15 * 60 * 1000;

/** Exponential backoff with a cap. Jitter is the caller's concern. */
export function backoffFor(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
}

/** Failures that will not improve on retry. */
const TERMINAL_CODES = new Set([
  'consent_missing',
  'mandate_missing',
  'mandate_revoked',
  'not_found',
  'forbidden',
  'invalid_input',
  'template_field_missing',
  'host_not_allowlisted',
]);

/**
 * Runs one job to completion, retry, or terminal failure.
 *
 * Error details are redacted before they are stored: a broker page or an
 * exception message can carry the member's own data, and a job row is read by
 * operators. See docs/threat-model.md section 6.
 */
export async function runJob(ctx: EngineContext, message: JobMessage): Promise<void> {
  const job = await ctx.store.getJob(message.jobId);
  if (!job) {
    ctx.log.warn('job_missing', { jobId: message.jobId });
    return;
  }
  if (job.state === 'succeeded' || job.state === 'cancelled') return;

  // Queues deliver at least once, and Cloudflare's do not deduplicate. Without
  // this guard a redelivery would run a second submit against the same case
  // and the broker would receive the opt-out twice.
  if (job.state === 'running' && job.startedAt !== null && ctx.ports.clock.now() - job.startedAt < JOB_LEASE_MS) {
    ctx.log.warn('job_already_running', { jobId: job.id, jobKind: job.kind });
    return;
  }

  const memberRow = await ctx.store.getMemberRow(job.memberId);
  if (!memberRow) {
    await ctx.store.finishJob(job.id, 'cancelled', 'not_found', 'member no longer exists');
    return;
  }
  if (memberRow.status !== 'active') {
    await ctx.store.finishJob(job.id, 'cancelled', 'forbidden', 'member is not active');
    return;
  }

  const dek = await ctx.store.unwrapDekFor(memberRow);
  await ctx.store.markJobRunning(job.id);
  const log = ctx.log.child({ jobId: job.id, jobKind: job.kind, attempt: job.attempt + 1 });

  try {
    await execute(ctx, job.kind, { memberId: job.memberId, dek, caseId: job.caseId, jobId: job.id });
    await ctx.store.finishJob(job.id, 'succeeded');
    log.debug('job_succeeded');
  } catch (error) {
    const code = codeOf(error);
    // Scrub the member's own values, not just generic PII shapes. A broker
    // page echoing "No record found for <name>, <street>" lands in
    // job.error_detail, which operators read — and a name is not an email,
    // a phone number or a date, so the shape rules alone would miss it.
    const detail = redact(error instanceof Error ? error.message : String(error), await profileSecrets(ctx, job.memberId, dek));

    if (TERMINAL_CODES.has(code) || job.attempt + 1 >= job.maxAttempts) {
      await ctx.store.finishJob(job.id, 'failed', code, detail);
      log.error('job_failed', { errorCode: code, terminal: true });
      return;
    }

    const runAfter = ctx.ports.clock.now() + backoffFor(job.attempt + 1);
    await ctx.store.rescheduleJob(job.id, runAfter, code, detail);
    await ctx.ports.queue.enqueue(message, backoffFor(job.attempt + 1));
    log.warn('job_retrying', { errorCode: code });
  }
}

/**
 * The member's own field values, for scrubbing free text before it is stored.
 * Returns nothing rather than throwing: redaction must never be the reason a
 * job fails.
 */
async function profileSecrets(ctx: EngineContext, memberId: string, dek: Uint8Array): Promise<string[]> {
  try {
    const profile = await ctx.store.loadProfile(memberId, dek);
    return [
      ...profile.names.flatMap((n) => [n.first, n.middle, n.last, [n.first, n.middle, n.last].filter(Boolean).join(' ')]),
      ...profile.aliases.flatMap((n) => [n.first, n.last]),
      ...profile.addresses.flatMap(({ address }) => [address.line1, address.city, address.postalCode]),
      ...profile.phones,
      ...profile.emails,
      ...(profile.dob ? [profile.dob] : []),
    ].filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}

async function execute(
  ctx: EngineContext,
  kind: JobMessage['kind'],
  params: { memberId: string; dek: Uint8Array; caseId: string | null; jobId: string },
): Promise<void> {
  switch (kind) {
    case 'scan': {
      if (!params.caseId) throw new EngineError('invalid_input', 'scan job carries the broker id in case_id');
      await runScan(ctx, { memberId: params.memberId, dek: params.dek, brokerId: params.caseId, jobId: params.jobId });
      return;
    }
    case 'submit': {
      if (!params.caseId) throw new EngineError('invalid_input', 'submit job needs a case');
      await runSubmit(ctx, { memberId: params.memberId, dek: params.dek, caseId: params.caseId, jobId: params.jobId });
      return;
    }
    case 'recheck': {
      if (!params.caseId) throw new EngineError('invalid_input', 'recheck job needs a case');
      await runRecheck(ctx, { memberId: params.memberId, dek: params.dek, caseId: params.caseId, jobId: params.jobId });
      return;
    }
    case 'report': {
      await generateReport(ctx, { memberId: params.memberId, dek: params.dek });
      return;
    }
  }
}

/**
 * The cron tick.
 *
 * Long waits live as rows with a `run_after`, not as in-memory timers or queue
 * delays, so a quarterly product survives a deploy. See ADR-0001.
 */
export async function tick(ctx: EngineContext, limit = 50): Promise<{ jobs: number; rechecks: number }> {
  const now = ctx.ports.clock.now();

  const due = await ctx.store.dueCases(now, limit);
  let rechecks = 0;
  for (const caseFile of due) {
    // Terminal-for-now states still get re-checked: that is the business model.
    const { id, created } = await ctx.store.createJob({
      memberId: caseFile.memberId,
      caseId: caseFile.id,
      kind: 'recheck',
      idempotencyKey: `recheck:${caseFile.id}:${Math.floor((caseFile.nextCheckAt ?? now) / 60_000)}`,
    });
    // Push the timer forward rather than clearing it. Clearing it meant that a
    // re-check which was skipped, failed, or died took the case out of
    // `dueCases` permanently, and the removal-verification loop this product
    // exists for stopped for that broker with nothing to show it had.
    await ctx.store.updateCase(caseFile.memberId, caseFile.id, { nextCheckAt: now + RECHECK_LEASE_MS });
    if (created) {
      await ctx.ports.queue.enqueue({ jobId: id, kind: 'recheck', memberId: caseFile.memberId, caseId: caseFile.id });
      rechecks++;
    }
  }

  // Safety net only: anything whose run_after is this far in the past was
  // enqueued once already and evidently never delivered.
  const pending = (await ctx.store.pendingJobs(now - LOST_MESSAGE_MS, limit)).filter(
    (job) => job.state === 'pending',
  );
  for (const job of pending) {
    ctx.log.warn('job_rescued', { jobId: job.id, jobKind: job.kind, attempt: job.attempt });
    await ctx.ports.queue.enqueue({
      jobId: job.id,
      kind: job.kind,
      memberId: job.memberId,
      caseId: job.caseId ?? undefined,
    });
  }

  const sweptSessions = await ctx.store.deleteExpiredSessions(now);

  if (rechecks > 0 || pending.length > 0 || sweptSessions > 0) {
    ctx.log.info('tick', { rechecks, jobs: pending.length, sessionsSwept: sweptSessions });
  }
  return { jobs: pending.length, rechecks };
}

/** Enqueues a full scan sweep for one member across every eligible broker. */
export async function enqueueFullScan(ctx: EngineContext, memberId: string): Promise<number> {
  const member = await ctx.store.getMemberRow(memberId);
  if (!member) throw new EngineError('not_found', 'member not found');

  const brokers = await ctx.store.listBrokers();
  const cycle = Math.floor(ctx.ports.clock.now() / 3_600_000);
  let queued = 0;

  for (const broker of brokers) {
    if (!broker.enabled || broker.status === 'broken' || broker.status === 'disabled') continue;
    const definition = ctx.catalog.get(broker.id);
    if (!definition || definition.search.method === 'none') continue;
    if (!appliesTo(broker.jurisdictions, member.jurisdiction)) continue;

    const { id, created } = await ctx.store.createJob({
      memberId,
      caseId: broker.id,
      kind: 'scan',
      idempotencyKey: `scan:${memberId}:${broker.id}:${cycle}`,
    });
    if (created) {
      await ctx.ports.queue.enqueue({ jobId: id, kind: 'scan', memberId, caseId: broker.id });
      queued++;
    }
  }
  ctx.log.info('full_scan_enqueued', { queued });
  return queued;
}

/** `US` covers `US-CA`; an exact match or a country-level entry both apply. */
export function appliesTo(brokerJurisdictions: readonly string[], memberJurisdiction: string): boolean {
  const country = memberJurisdiction.split('-')[0] ?? memberJurisdiction;
  return brokerJurisdictions.some((j) => j === memberJurisdiction || j === country);
}
