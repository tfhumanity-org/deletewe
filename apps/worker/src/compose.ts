import { FileCatalog, syncCatalog } from '@deletewe/catalog';
import {
  createLogger,
  CryptoService,
  DEFAULT_CONFIG,
  fromHex,
  migrate,
  NullDropChannel,
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

let migrated = false;

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
  const { catalog, result } = await FileCatalog.load();
  await syncCatalog(store, result.brokers);

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
    drop: new NullDropChannel(),
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
