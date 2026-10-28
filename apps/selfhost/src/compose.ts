import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FileCatalog, syncCatalog } from '@deletewe/catalog';
import {
  createLogger,
  CryptoService,
  DEFAULT_CONFIG,
  migrate,
  GuidedDropChannel,
  NullLetterDispatch,
  runJob,
  Store,
  systemClock,
  type EngineConfig,
  type EngineContext,
  type JobMessage,
  type LogLevel,
  type LogRecord,
  type Ports,
} from '@deletewe/engine';
import {
  FileBlobStore,
  HttpApiMailer,
  InProcessQueue,
  keysFromEnv,
  loadOrCreateKeyFile,
  OutboxMailer,
  PlusAddressInbound,
  SqliteDatabase,
} from '@deletewe/adapters-node';
import { FetchBrowserDriver } from '@deletewe/browser';

export interface SelfHostConfig {
  readonly dataDir: string;
  readonly port: number;
  readonly baseUrl: string;
  readonly inboundLocalPart: string;
  readonly inboundDomain: string;
  readonly agentEmailFrom: string;
  readonly mailEndpoint?: string;
  readonly mailApiKey?: string;
  readonly logLevel: LogLevel;
  readonly secureCookies: boolean;
  /**
   * Disclosed in the member's DROP account under § 7621(b). Leave unset and
   * members submit in their own name, which works identically.
   */
  readonly dropAgentName?: string;
  readonly dropAgentEmail?: string;
  readonly dropAgentTradeName?: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SelfHostConfig {
  const baseUrl = env['DELETEWE_BASE_URL'] ?? `http://localhost:${env['PORT'] ?? '8787'}`;
  const inboundDomain = env['DELETEWE_INBOUND_DOMAIN'] ?? 'localhost';
  return {
    dataDir: env['DELETEWE_DATA_DIR'] ?? join(process.cwd(), 'data'),
    port: Number(env['PORT'] ?? '8787'),
    baseUrl,
    inboundLocalPart: env['DELETEWE_INBOUND_LOCAL'] ?? 'optout',
    inboundDomain,
    agentEmailFrom: env['DELETEWE_FROM'] ?? `privacy@${inboundDomain}`,
    mailEndpoint: env['DELETEWE_MAIL_ENDPOINT'],
    mailApiKey: env['DELETEWE_MAIL_API_KEY'],
    logLevel: (env['DELETEWE_LOG_LEVEL'] as LogLevel | undefined) ?? 'info',
    secureCookies: baseUrl.startsWith('https://'),
    dropAgentName: env['DELETEWE_DROP_AGENT_NAME'],
    dropAgentEmail: env['DELETEWE_DROP_AGENT_EMAIL'],
    dropAgentTradeName: env['DELETEWE_DROP_AGENT_TRADE_NAME'],
  };
}

export interface Composed {
  readonly ctx: EngineContext;
  readonly queue: InProcessQueue;
  readonly db: SqliteDatabase;
  readonly config: SelfHostConfig;
  readonly catalogIssues: number;
  readonly keyCreated: boolean;
  close(): void;
}

/**
 * The self-host composition root: concrete adapters bound to the ports the
 * engine declares. The engine itself never learns which set it got.
 * See docs/adr/0001-ports-and-adapters.md.
 */
export async function compose(config: SelfHostConfig = configFromEnv()): Promise<Composed> {
  await mkdir(config.dataDir, { recursive: true });
  await mkdir(join(config.dataDir, 'blobs'), { recursive: true });
  await mkdir(join(config.dataDir, 'outbox'), { recursive: true });

  const envKeys = keysFromEnv(process.env);
  const { keys, created } = envKeys
    ? { keys: envKeys, created: false }
    : await loadOrCreateKeyFile(join(config.dataDir, 'keys.json'));

  const db = SqliteDatabase.open(join(config.dataDir, 'deletewe.sqlite'));
  await migrate({
    exec: (sql) => db.exec(sql),
    run: (sql, params) => db.run(sql, params),
    all: (sql) => db.all(sql),
    now: () => systemClock.now(),
  });

  const store = new Store(db, new CryptoService(keys), systemClock);
  const { catalog, result } = await FileCatalog.load();
  await syncCatalog(store, result.brokers);

  const queue = new InProcessQueue(2);
  const engineConfig: EngineConfig = {
    ...DEFAULT_CONFIG,
    baseUrl: config.baseUrl,
    agentEmailFrom: config.agentEmailFrom,
  };

  const ports: Ports = {
    db,
    blobs: new FileBlobStore(join(config.dataDir, 'blobs')),
    queue,
    browser: new FetchBrowserDriver(),
    mailer:
      config.mailEndpoint && config.mailApiKey
        ? new HttpApiMailer(config.mailEndpoint, config.mailApiKey)
        : new OutboxMailer(join(config.dataDir, 'outbox')),
    inbound: new PlusAddressInbound(config.inboundLocalPart, config.inboundDomain),
    drop: new GuidedDropChannel(
      config.dropAgentName && config.dropAgentEmail
        ? { fullName: config.dropAgentName, email: config.dropAgentEmail, tradeName: config.dropAgentTradeName }
        : undefined,
    ),
    letters: new NullLetterDispatch(),
    clock: systemClock,
  };

  const ctx: EngineContext = {
    store,
    ports,
    catalog,
    log: createLogger(consoleSink, config.logLevel, { instance: 'selfhost' }),
    config: engineConfig,
  };

  queue.setHandler((message: JobMessage) => runJob(ctx, message));

  return {
    ctx,
    queue,
    db,
    config,
    catalogIssues: result.issues.filter((i) => i.severity === 'error').length,
    keyCreated: created,
    close: () => {
      queue.stop();
      db.close();
    },
  };
}

const consoleSink = {
  write(record: LogRecord): void {
    const line = JSON.stringify({ level: record.level, msg: record.msg, at: record.at, ...record.fields });
    if (record.level === 'error') console.error(line);
    else console.log(line);
  },
};
