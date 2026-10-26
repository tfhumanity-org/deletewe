/**
 * Port interfaces. The domain core depends on nothing else.
 *
 * Two adapter sets implement these: @deletewe/adapters-cf (Workers, D1, R2,
 * Queues, Browser Rendering, Email Routing) and @deletewe/adapters-node
 * (SQLite, filesystem, in-process scheduler, fetch/Playwright, SMTP).
 * See docs/adr/0001-ports-and-adapters.md.
 */
import type { JobKind } from './types.ts';

// --- Time ------------------------------------------------------------------

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

// --- Database --------------------------------------------------------------

export type SqlParam = string | number | null | Uint8Array;

export interface Database {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlParam[]): Promise<{ changes: number }>;
  get<T>(sql: string, params?: readonly SqlParam[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  /**
   * Runs `fn` against the same connection. On SQLite this is a real
   * transaction; on D1 it is a logical grouping only, which is why every write
   * path is idempotent rather than relying on rollback.
   */
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
}

// --- Blob storage ----------------------------------------------------------

export interface BlobStore {
  /** Write-once. Throws `storage_conflict` if the key already exists. */
  put(key: string, bytes: Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

// --- Jobs ------------------------------------------------------------------

export interface JobMessage {
  readonly jobId: string;
  readonly kind: JobKind;
  readonly memberId: string;
  readonly caseId?: string;
}

export interface JobQueue {
  enqueue(message: JobMessage, delayMs?: number): Promise<void>;
}

// --- Browser ---------------------------------------------------------------

export interface ElementSnapshot {
  readonly text: string;
  readonly html: string;
  readonly attrs: Readonly<Record<string, string>>;
}

export interface PageHandle {
  url(): string;
  status(): number;
  content(): Promise<string>;
  text(): Promise<string>;
  querySelector(selector: string): Promise<ElementSnapshot | null>;
  queryAll(selector: string): Promise<ElementSnapshot[]>;
  fill(selector: string, value: string): Promise<void>;
  select(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitFor(selector: string | undefined, ms: number | undefined): Promise<void>;
  /** Undefined when the driver cannot render (e.g. the fetch driver). */
  screenshot(): Promise<Uint8Array | undefined>;
  close(): Promise<void>;
}

export interface NavigateOptions {
  /** Hosts this page is permitted to reach. Enforced by the driver. */
  readonly allowedHosts: readonly string[];
  readonly userAgent: string;
  readonly timeoutMs: number;
}

export interface BrowserDriver {
  readonly kind: string;
  /** True when `screenshot()` can return bytes. */
  readonly canScreenshot: boolean;
  open(url: string, options: NavigateOptions): Promise<PageHandle>;
}

// --- Mail ------------------------------------------------------------------

export interface OutboundMessage {
  readonly to: string;
  readonly cc?: readonly string[];
  /** Per-job reply address so an inbound reply routes back to one job. */
  readonly replyTo: string;
  readonly from: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  send(message: OutboundMessage): Promise<void>;
}

export interface InboundMessage {
  readonly to: string;
  readonly from: string;
  readonly subject: string;
  readonly text: string;
  readonly raw: string;
  readonly receivedAt: number;
  /** SPF/DKIM verdict from the receiving platform, when available. */
  readonly authenticated: boolean | undefined;
}

export interface InboundMail {
  /** Allocates an address that routes replies back to this job. */
  addressFor(token: string): string;
  /** Extracts the token from a delivered address, or undefined if foreign. */
  tokenFrom(address: string): string | undefined;
}

// --- Statutory and physical channels --------------------------------------

export interface DropRequest {
  readonly memberId: string;
  readonly jurisdiction: string;
  readonly fullName: string;
  readonly email: string;
}

export interface DropSubmission {
  readonly accepted: boolean;
  readonly reference?: string;
  readonly reason?: string;
}

/**
 * California's Delete Request and Opt-out Platform. Live since 1 Jan 2026;
 * brokers must poll it every 45 days since 1 Aug 2026.
 * See docs/research/05-legal-basis.md.
 */
export interface DropChannel {
  readonly available: boolean;
  submit(request: DropRequest): Promise<DropSubmission>;
  pollStatus(reference: string): Promise<{ state: string; updatedAt: number } | undefined>;
}

export interface LetterRequest {
  readonly recipient: string;
  readonly addressLines: readonly string[];
  readonly fax?: string;
  readonly pdf: Uint8Array;
}

export interface LetterDispatch {
  readonly available: boolean;
  send(request: LetterRequest): Promise<{ accepted: boolean; reference?: string; reason?: string }>;
}

// --- Composition -----------------------------------------------------------

export interface Ports {
  readonly db: Database;
  readonly blobs: BlobStore;
  readonly queue: JobQueue;
  readonly browser: BrowserDriver;
  readonly mailer: Mailer;
  readonly inbound: InboundMail;
  readonly drop: DropChannel;
  readonly letters: LetterDispatch;
  readonly clock: Clock;
}
