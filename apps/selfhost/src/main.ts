import { serve } from '@hono/node-server';
import { handleInboundMessage, tick } from '@deletewe/engine';
import { createApp } from '@deletewe/web';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { compose } from './compose.ts';

const TICK_INTERVAL_MS = 60_000;

const composed = await compose();
const { ctx, config, queue } = composed;

if (composed.keyCreated) {
  console.log('');
  console.log('  A new encryption key was generated at:');
  console.log(`    ${join(config.dataDir, 'keys.json')}`);
  console.log('  Back it up before you put anything real in. Losing it makes every');
  console.log('  stored record permanently unreadable — that is what encryption means.');
  console.log('');
}
if (composed.catalogIssues > 0) {
  console.error(`  ${String(composed.catalogIssues)} broker definition(s) failed validation and were skipped.`);
}

const app = createApp({ ctx, secureCookies: config.secureCookies });

/**
 * Inbound confirmation mail. Either an IMAP mailbox we poll, or `.eml` files
 * dropped into `data/maildrop` — most opt-outs complete only when a link in
 * one of these is followed, so this is the part that decides whether the
 * product works. See docs/research/03-removal-mechanics.md.
 */
await mkdir(join(config.dataDir, 'maildrop'), { recursive: true });

async function drainInbound(): Promise<void> {
  const messages = await composed.inbound.collect();
  for (const message of messages) {
    const result = await handleInboundMessage(ctx, message);
    ctx.log.info('inbound_mail_handled', { outcome: result.kind, source: composed.inbound.kind });
  }
}

const timer = setInterval(() => {
  void (async () => {
    try {
      await drainInbound();
      await tick(ctx);
    } catch (error) {
      ctx.log.error('tick_failed', { errorCode: error instanceof Error ? error.name : 'unknown' });
    }
  })();
}, TICK_INTERVAL_MS);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`deletewe listening on http://localhost:${String(info.port)}`);
  console.log(`  data directory: ${config.dataDir}`);
  console.log(`  outbound mail:  ${config.mailEndpoint ? 'provider API' : `outbox files in ${join(config.dataDir, 'outbox')}`}`);
  console.log(`  inbound mail:   ${composed.inbound.kind}`);
  console.log(`  browser:        ${ctx.ports.browser.kind}${ctx.ports.browser.canScreenshot ? ' (screenshots on)' : ' (no screenshots)'}`);
});

const shutdown = () => {
  clearInterval(timer);
  queue.stop();
  server.close();
  composed.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
