import { handleInboundMessage, runJob, tick, type JobMessage } from '@deletewe/engine';
import { readEmailMessage } from '@deletewe/adapters-cf';
import type { ExecutionContext, ForwardableEmailMessage, MessageBatch } from '@deletewe/adapters-cf';
import { parseEmail } from '@deletewe/adapters-node';
import { createApp } from '@deletewe/web';
import { composeWorker } from './compose.ts';
import type { WorkerEnv } from './env.ts';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const ctx = await composeWorker(env);
    return createApp({ ctx, secureCookies: true }).fetch(request);
  },

  /** Job dispatch. Retries are owned by the engine, not by the queue. */
  async queue(batch: MessageBatch<JobMessage>, env: WorkerEnv): Promise<void> {
    const ctx = await composeWorker(env);
    for (const message of batch.messages) {
      try {
        await runJob(ctx, message.body);
        message.ack();
      } catch {
        // runJob already recorded the failure and scheduled its own retry;
        // acking here prevents a second, uncoordinated retry from the queue.
        message.ack();
      }
    }
  },

  /** The cron tick that sweeps durable timers: re-checks and pending jobs. */
  async scheduled(_event: unknown, env: WorkerEnv, executionCtx: ExecutionContext): Promise<void> {
    const ctx = await composeWorker(env);
    executionCtx.waitUntil(tick(ctx));
  },

  /** Inbound confirmation mail from Email Routing. */
  async email(message: ForwardableEmailMessage, env: WorkerEnv): Promise<void> {
    const ctx = await composeWorker(env);
    const parsed = await readEmailMessage(message, parseEmail, Date.now());
    const result = await handleInboundMessage(ctx, parsed);
    if (result.kind === 'ignored') message.setReject('Unrecognised recipient.');
  },
};
