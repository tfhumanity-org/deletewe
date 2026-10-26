import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrokerDefinition } from '@deletewe/schema';
import { checkDefinition } from '@deletewe/schema';
import {
  CryptoService,
  DEFAULT_CONFIG,
  createLogger,
  MemorySink,
  migrate,
  randomKey,
  Store,
  type Catalog,
  type Clock,
  type EngineContext,
  type Member,
  type Ports,
} from '@deletewe/engine';
import { NullDropChannel, NullLetterDispatch } from '@deletewe/engine';
import { FileBlobStore, InProcessQueue, OutboxMailer, PlusAddressInbound, SqliteDatabase } from '@deletewe/adapters-node';
import { FixtureBrowserDriver, type FixtureRoute } from '@deletewe/browser';

/** A clock the test drives, so multi-day waits take microseconds. */
export class TestClock implements Clock {
  constructor(private current = Date.UTC(2026, 9, 27, 9, 0, 0)) {}
  now(): number { return this.current; }
  advance(ms: number): void { this.current += ms; }
  advanceDays(days: number): void { this.advance(days * 86_400_000); }
}

export class TestCatalog implements Catalog {
  private readonly byId = new Map<string, BrokerDefinition>();

  constructor(definitions: readonly BrokerDefinition[]) {
    for (const d of definitions) this.byId.set(d.id, d);
  }

  get(id: string): BrokerDefinition | undefined { return this.byId.get(id); }
  list(): readonly BrokerDefinition[] { return [...this.byId.values()]; }
  sha256(id: string): string | undefined { return this.byId.has(id) ? `sha-${id}` : undefined; }
}

export interface Harness {
  readonly ctx: EngineContext;
  readonly store: Store;
  readonly ports: Ports;
  readonly clock: TestClock;
  readonly queue: InProcessQueue;
  readonly mailer: OutboxMailer;
  readonly browser: FixtureBrowserDriver;
  readonly logs: MemorySink;
  readonly inbound: PlusAddressInbound;
  readonly blobs: FileBlobStore;
  dispose(): void;
}

export interface HarnessOptions {
  readonly definitions: readonly BrokerDefinition[];
  readonly routes?: readonly FixtureRoute[];
}

export async function createHarness(options: HarnessOptions): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'deletewe-test-'));
  const clock = new TestClock();
  const db = SqliteDatabase.memory();
  await migrate({
    exec: (sql) => db.exec(sql),
    run: (sql, params) => db.run(sql, params),
    all: (sql) => db.all(sql),
    now: () => clock.now(),
  });

  const crypto = new CryptoService({ masterKey: randomKey(), indexKey: randomKey(), version: 1 });
  const store = new Store(db, crypto, clock);
  const logs = new MemorySink();
  const queue = new InProcessQueue(1, () => clock.now());
  const mailer = new OutboxMailer();
  const browser = new FixtureBrowserDriver(options.routes ?? []);
  const inbound = new PlusAddressInbound('optout', 'agent.test');
  const blobs = new FileBlobStore(join(dir, 'blobs'));

  const ports: Ports = {
    db,
    blobs,
    queue,
    browser,
    mailer,
    inbound,
    drop: new NullDropChannel(),
    letters: new NullLetterDispatch(),
    clock,
  };

  const ctx: EngineContext = {
    store,
    ports,
    catalog: new TestCatalog(options.definitions),
    log: createLogger(logs, 'debug'),
    config: { ...DEFAULT_CONFIG, agentEmailFrom: 'privacy@agent.test', baseUrl: 'https://app.test' },
  };

  for (const definition of options.definitions) {
    await store.upsertBroker({
      id: definition.id,
      name: definition.name,
      homepage: definition.homepage,
      category: definition.category,
      definitionVersion: definition.version,
      definitionSha256: `sha-${definition.id}`,
      automationLevel: definition.automation.level,
      optOutMethod: definition.opt_out.method,
      relistIntervalDays: definition.relist.interval_days,
      jurisdictions: definition.jurisdictions,
      enabled: definition.enabled,
      verifiedAt: definition.verified_at ?? null,
    });
  }

  let disposed = false;
  return {
    ctx, store, ports, clock, queue, mailer, browser, logs, inbound, blobs,
    // Idempotent: suites share an afterEach, so dispose can be called twice.
    dispose: () => {
      if (disposed) return;
      disposed = true;
      queue.stop();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A member with full consent, a signed mandate, and a complete profile. */
export async function enrolTestMember(
  h: Harness,
  overrides: { email?: string; jurisdiction?: string } = {},
): Promise<{ member: Member; dek: Uint8Array }> {
  const { enrol, signMandate, addProfileEntry } = await import('@deletewe/engine');
  const { member, dek } = await enrol(h.ctx, {
    email: overrides.email ?? 'ada@member.test',
    password: 'a-sufficiently-long-password',
    jurisdiction: overrides.jurisdiction ?? 'US-CA',
    consents: ['process_pii', 'contact_brokers', 'store_evidence'],
  });

  await signMandate(h.ctx, { memberId: member.id, dek, kind: 'authorized_agent', signatureName: 'Ada Lovelace' });

  await addProfileEntry(h.ctx, {
    memberId: member.id, dek,
    data: { kind: 'name', value: { first: 'Ada', middle: 'Byron', last: 'Lovelace' } },
  });
  await addProfileEntry(h.ctx, {
    memberId: member.id, dek,
    data: {
      kind: 'address',
      value: { line1: '12 St James Square', city: 'Berkeley', region: 'CA', postalCode: '94704', country: 'US' },
    },
  });
  await addProfileEntry(h.ctx, { memberId: member.id, dek, data: { kind: 'email', value: 'ada@member.test' } });
  await addProfileEntry(h.ctx, { memberId: member.id, dek, data: { kind: 'phone', value: '+1 510 555 0101' } });
  await addProfileEntry(h.ctx, { memberId: member.id, dek, data: { kind: 'dob', value: '1979-12-10' } });

  return { member, dek };
}

/** Parses a definition through the real validator so tests cannot use an invalid one. */
export function definition(input: unknown): BrokerDefinition {
  const id = (input as { id: string }).id;
  const result = checkDefinition(input, id);
  if (!result.definition) {
    throw new Error(`invalid test definition:\n${result.issues.map((i) => `${i.path}: ${i.message}`).join('\n')}`);
  }
  return result.definition;
}
