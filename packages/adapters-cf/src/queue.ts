import type { JobMessage, JobQueue } from '@deletewe/engine';
import type { Queue } from './cf-types.ts';

/**
 * Cloudflare Queues for short-lived dispatch and retry backoff only.
 *
 * Long waits — verification windows and quarterly re-checks — are rows with a
 * `run_after` swept by a cron trigger, not queue delays, so they survive a
 * deploy and behave identically when self-hosted. See ADR-0001.
 */
export class CloudflareQueue implements JobQueue {
  /** Queues cap a delivery delay at 12 hours. */
  private static readonly MAX_DELAY_SECONDS = 12 * 60 * 60;

  constructor(private readonly queue: Queue<JobMessage>) {}

  async enqueue(message: JobMessage, delayMs = 0): Promise<void> {
    const delaySeconds = Math.min(Math.ceil(delayMs / 1000), CloudflareQueue.MAX_DELAY_SECONDS);
    await this.queue.send(message, delaySeconds > 0 ? { delaySeconds } : undefined);
  }
}
