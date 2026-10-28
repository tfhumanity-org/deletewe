/**
 * Port interfaces. The domain core depends on nothing else.
 *
 * Two adapter sets implement these: @deletewe/adapters-cf (Workers, D1, R2,
 * Queues, Browser Rendering, Email Routing) and @deletewe/adapters-node
 * (SQLite, filesystem, in-process scheduler, fetch/Playwright, SMTP).
 * See docs/adr/0001-ports-and-adapters.md.
 */
import type { DropAgentIdentity, DropStep } from './drop.ts';
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
  /**
   * Scoped lookup within this element. Extraction rules name a selector
   * relative to the result container, and only the driver holds a DOM, so the
   * snapshot carries the lookup rather than the raw document.
   */
  find(selector: string): ElementSnapshot | null;
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

/**
 * Where inbound confirmation mail is collected from.
 *
 * Separate from `InboundMail`, which only does addressing: on Cloudflare,
 * Email Routing pushes messages to the Worker and there is nothing to poll,
 * while a self-hosted instance has to go and fetch them.
 *
 * Most people-search opt-outs complete only when an emailed link is clicked,
 * often within about 24 hours, so this is the component that decides whether
 * the product works at all. See docs/research/03-removal-mechanics.md.
 */
export interface InboundMailSource {
  readonly kind: string;
  /**
   * Returns newly arrived messages and marks them consumed, so a message is
   * handled once. Implementations must not drop a message they have not
   * returned.
   */
  collect(limit?: number): Promise<InboundMessage[]>;
  /** Cheap reachability check, for `deletewe mail test`. */
  check(): Promise<{ ok: boolean; detail: string }>;
}

// --- Statutory and physical channels --------------------------------------

export interface DropRequest {
  readonly memberId: string;
  readonly jurisdiction: string;
  readonly fullName: string;
  readonly email: string;
}

/**
 * The outcome of asking the channel to make a DROP request.
 *
 * `member_action_required` is not a failure — it is the correct answer under
 * the current regulations, which require the consumer to pass a State
 * residency check no agent can pass for them. See packages/engine/src/drop.ts.
 */
export type DropSubmission =
  | { readonly kind: 'member_action_required'; readonly steps: readonly DropStep[]; readonly instructions: string }
  | { readonly kind: 'accepted'; readonly reference: string }
  | { readonly kind: 'ineligible'; readonly reason: string }
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface DropStatus {
  readonly state: string;
  readonly updatedAt: number;
}

/**
 * California's Delete Request and Opt-out Platform. Live since 1 Jan 2026;
 * registered brokers must retrieve requests every 45 days since 1 Aug 2026.
 * See docs/research/05-legal-basis.md and packages/engine/src/drop.ts.
 */
export interface DropChannel {
  readonly available: boolean;
  /** Disclosed in the member's DROP account under § 7621(b), when configured. */
  readonly agent: DropAgentIdentity | undefined;
  submit(request: DropRequest): Promise<DropSubmission>;
  pollStatus(reference: string): Promise<DropStatus | undefined>;
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
