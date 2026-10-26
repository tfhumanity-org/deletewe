import type { BrokerDefinition } from '@deletewe/schema';
import type { Store } from './db/store.ts';
import type { Logger } from './logger.ts';
import type { Ports } from './ports.ts';

/** Read-only access to the broker catalogue. Backed by files on disk. */
export interface Catalog {
  get(brokerId: string): BrokerDefinition | undefined;
  list(): readonly BrokerDefinition[];
  /** SHA-256 of the definition file, recorded on every job and evidence record. */
  sha256(brokerId: string): string | undefined;
}

export interface EngineConfig {
  readonly engineVersion: string;
  /** Identifies us honestly to brokers. See docs/architecture.md section 5. */
  readonly userAgent: string;
  /** Base URL used to build member-facing task deep links. */
  readonly baseUrl: string;
  /** From address for outbound opt-out email. */
  readonly agentEmailFrom: string;
  readonly browserTimeoutMs: number;
  /** Days after an acknowledgement before a re-check is treated as proof. */
  readonly removalGraceDays: number;
}

export interface EngineContext {
  readonly store: Store;
  readonly ports: Ports;
  readonly catalog: Catalog;
  readonly log: Logger;
  readonly config: EngineConfig;
}

export const DEFAULT_CONFIG: EngineConfig = {
  engineVersion: '0.1.0',
  userAgent: 'deletewe/0.1 (+https://github.com/tfhumanity-org/deletewe; authorized agent opt-out request)',
  baseUrl: 'http://localhost:8787',
  agentEmailFrom: 'privacy@localhost',
  browserTimeoutMs: 30_000,
  removalGraceDays: 7,
};
