import type { JobMessage, JobQueue } from '@deletewe/engine';

export type JobHandler = (message: JobMessage) => Promise<void>;

/**
 * In-process queue for self-hosting.
 *
 * Delays here are short-lived retry backoff only. Long waits — verification
 * windows and re-check intervals — live as `scheduled_job` / `next_check_at`
 * rows swept by the cron tick, so they survive a restart. See ADR-0001.
 */
export class InProcessQueue implements JobQueue {
  private readonly pending: { message: JobMessage; runAfter: number }[] = [];
  private handler: JobHandler | undefined;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly concurrency = 2,
    private readonly now: () => number = Date.now,
  ) {}

  setHandler(handler: JobHandler): void {
    this.handler = handler;
  }

  async enqueue(message: JobMessage, delayMs = 0): Promise<void> {
    if (this.pending.some((p) => p.message.jobId === message.jobId)) return;
    this.pending.push({ message, runAfter: this.now() + delayMs });
    this.schedule();
  }

  get depth(): number {
    return this.pending.length;
  }

  /** Runs everything currently due. Used by the CLI and by tests. */
  async drain(maxIterations = 1000): Promise<number> {
    let handled = 0;
    for (let i = 0; i < maxIterations; i++) {
      const next = this.takeDue();
      if (!next) break;
      await this.dispatch(next);
      handled++;
    }
    return handled;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private takeDue(): JobMessage | undefined {
    const index = this.pending.findIndex((p) => p.runAfter <= this.now());
    if (index === -1) return undefined;
    return this.pending.splice(index, 1)[0]?.message;
  }

  private schedule(): void {
    if (this.running || this.timer || !this.handler) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.pump();
    }, 10);
    if (typeof this.timer === 'object' && 'unref' in this.timer) this.timer.unref();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let batch = this.takeBatch();
      while (batch.length > 0) {
        await Promise.all(batch.map((m) => this.dispatch(m)));
        batch = this.takeBatch();
      }
    } finally {
      this.running = false;
      if (this.pending.length > 0) this.schedule();
    }
  }

  private takeBatch(): JobMessage[] {
    const batch: JobMessage[] = [];
    for (let i = 0; i < this.concurrency; i++) {
      const next = this.takeDue();
      if (!next) break;
      batch.push(next);
    }
    return batch;
  }

  private async dispatch(message: JobMessage): Promise<void> {
    if (!this.handler) return;
    try {
      await this.handler(message);
    } catch {
      // The dispatcher owns retries; a throw past it is already recorded on
      // the job row, so swallowing here only prevents an unhandled rejection.
    }
  }
}
