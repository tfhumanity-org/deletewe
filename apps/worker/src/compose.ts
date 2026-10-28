import { BUNDLED_BROKERS, BundledCatalog, syncCatalog } from '@deletewe/catalog';
import {
  createLogger,
  CryptoService,
  DEFAULT_CONFIG,
  fromHex,
  migrate,
  GuidedDropChannel,
  NullLetterDispatch,
  Store,
  systemClock,
  type EngineContext,
  type LogLevel,
  type LogRecord,
  type Ports,
} from '@deletewe/engine';
import {
  BrowserRenderingDriver,
  CloudflareQueue,
  D1Adapter,
  EmailRoutingInbound,
  R2BlobStore,
} from '@deletewe/adapters-cf';
import { FetchBrowserDriver } from '@deletewe/browser';
import { HttpApiMailer } from '@deletewe/adapters-node';
import type { WorkerEnv } from './env.ts';

/**
 * Built once per isolate, not per request.
 *
 * The file loader uses node:fs, which does not exist here, and re-parsing 29
 * YAML definitions on every fetch, queue message and cron tick would be waste
 * even where it does. `generated.ts` is the build-time projection of the same
 * files — see packages/catalog/src/bin/bundle.ts.
 */
const catalog = new BundledCatalog(BUNDLED_BROKERS);

let migrated = false;
let catalogSynced = false;

/**
 * The Cloudflare composition root. Same engine, same catalogue, same SQL —
 * only the adapters differ from the self-hosted build.
 * See docs/adr/0001-ports-and-adapters.md.
 */
export async function composeWorker(env: WorkerEnv): Promise<EngineContext> {
  const db = new D1Adapter(env.DB);

  if (!migrated) {
    await migrate({
      exec: (sql) => db.exec(sql),
      run: (sql, params) => db.run(sql, params),
      all: (sql) => db.all(sql),
      now: () => systemClock.now(),
    });
    migrated = true;
  }

  const crypto = new CryptoService({
    masterKey: fromHex(env.MASTER_KEY),
    indexKey: fromHex(env.INDEX_KEY),
    version: Number(env.KEY_VERSION ?? '1'),
  });

  const store = new Store(db, crypto, systemClock);

  // Projecting the catalogue into the broker table is ~60 D1 round-trips, so
  // it runs once per isolate rather than on every invocation.
  if (!catalogSynced) {
    await syncCatalog(store, BUNDLED_BROKERS);
    catalogSynced = true;
  }

  const ports: Ports = {
    db,
    blobs: new R2BlobStore(env.EVIDENCE),
    queue: new CloudflareQueue(env.JOBS),
    browser: env.BROWSER ? new BrowserRenderingDriver(env.BROWSER) : new FetchBrowserDriver(),
    mailer:
      env.MAIL_ENDPOINT && env.MAIL_API_KEY
        ? new HttpApiMailer(env.MAIL_ENDPOINT, env.MAIL_API_KEY)
        : { async send() { throw new Error('no mail provider configured: set MAIL_ENDPOINT and MAIL_API_KEY'); } },
    inbound: new EmailRoutingInbound(env.INBOUND_LOCAL ?? 'optout', env.INBOUND_DOMAIN),
    drop: new GuidedDropChannel(
      env.DROP_AGENT_NAME && env.DROP_AGENT_EMAIL
        ? { fullName: env.DROP_AGENT_NAME, email: env.DROP_AGENT_EMAIL, tradeName: env.DROP_AGENT_TRADE_NAME }
        : undefined,
    ),
    letters: new NullLetterDispatch(),
    clock: systemClock,
  };

  return {
    store,
    ports,
    catalog,
    log: createLogger(workerSink, (env.LOG_LEVEL as LogLevel | undefined) ?? 'info', { instance: 'worker' }),
    config: {
      ...DEFAULT_CONFIG,
      baseUrl: env.BASE_URL,
      agentEmailFrom: env.AGENT_FROM ?? `privacy@${env.INBOUND_DOMAIN}`,
    },
  };
}

const workerSink = {
  write(record: LogRecord): void {
    const line = JSON.stringify({ level: record.level, msg: record.msg, at: record.at, ...record.fields });
    if (record.level === 'error') console.error(line);
    else console.log(line);
  },
};
