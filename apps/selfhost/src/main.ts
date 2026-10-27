import { serve } from '@hono/node-server';
import { handleInboundMessage, tick } from '@deletewe/engine';
import { parseEmail } from '@deletewe/adapters-node';
import { createApp } from '@deletewe/web';
import { join } from 'node:path';
import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
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
 * Inbound verification mail for self-hosters: drop `.eml` files into
 * `data/maildrop` (from an IMAP fetch, a procmail rule, whatever) and they are
 * routed to the job waiting on them.
 */
const maildrop = join(config.dataDir, 'maildrop');
const processed = join(maildrop, 'processed');
await mkdir(processed, { recursive: true });

async function drainMaildrop(): Promise<void> {
  // Snapshot the filenames first and archive only those. Re-reading the
  // directory afterwards would also sweep up anything that arrived while we
  // were following confirmation links, losing it unprocessed.
  const names = (await readdir(maildrop)).filter((n) => n.endsWith('.eml')).sort();
  if (names.length === 0) return;

  for (const name of names) {
    const path = join(maildrop, name);
    try {
      const result = await handleInboundMessage(ctx, parseEmail(await readFile(path, 'utf8'), Date.now()));
      ctx.log.info('inbound_mail_handled', { outcome: result.kind });
    } catch {
      ctx.log.error('inbound_mail_failed');
    }
    await rename(path, join(processed, name));
  }
}

const timer = setInterval(() => {
  void (async () => {
    try {
      await drainMaildrop();
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
  console.log(`  inbound mail:   drop .eml files into ${maildrop}`);
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
