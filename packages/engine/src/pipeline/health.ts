import type { EngineContext } from '../context.ts';
import type { BrokerStatus, HealthFailure } from '../types.ts';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SAMPLES = 3;

/**
 * Broker health.
 *
 * A broker changing its page layout looks, from the outside, exactly like a
 * broker ignoring the request. Conflating the two is how services in this
 * category degrade silently, so an expectation failure is recorded as a health
 * incident against the *definition* and never as a failed opt-out.
 * See docs/architecture.md section 8.
 */
export async function recordFailure(
  ctx: EngineContext,
  brokerId: string,
  failureKind: HealthFailure,
  stepId: string | undefined,
  definitionSha256: string,
): Promise<void> {
  await ctx.store.recordHealth({ brokerId, ok: false, failureKind, stepId, definitionSha256 });
  await reevaluate(ctx, brokerId);
}

export async function recordSuccess(ctx: EngineContext, brokerId: string, definitionSha256: string): Promise<void> {
  await ctx.store.recordHealth({ brokerId, ok: true, definitionSha256 });
  await reevaluate(ctx, brokerId);
}

/** Rolling-window status. Published on the catalogue; gates dispatch. */
export async function reevaluate(ctx: EngineContext, brokerId: string): Promise<BrokerStatus> {
  const { total, failures } = await ctx.store.healthSummary(brokerId, WINDOW_MS);
  const status = classify(total, failures);
  const broker = await ctx.store.getBroker(brokerId);
  if (broker && broker.status !== status && broker.status !== 'disabled') {
    await ctx.store.setBrokerStatus(brokerId, status);
    ctx.log.info('broker_status_changed', { brokerId, from: broker.status, to: status, total, failures });
  }
  return status;
}

export function classify(total: number, failures: number): BrokerStatus {
  if (total < MIN_SAMPLES) return 'healthy';
  const rate = failures / total;
  if (rate >= 0.8) return 'broken';
  if (rate >= 0.3) return 'degraded';
  return 'healthy';
}

/** A broken broker is paused rather than retried into the ground. */
export function dispatchAllowed(status: BrokerStatus): boolean {
  return status === 'healthy' || status === 'degraded';
}
