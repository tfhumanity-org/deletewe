/**
 * Minimal structural types for the Cloudflare bindings we use.
 *
 * Declared here rather than pulled from `@cloudflare/workers-types` so the
 * repository installs and typechecks without a platform-specific types
 * package. Replace with the official types if you prefer; the shapes match.
 */

export interface D1Result<T = unknown> {
  readonly results: T[];
  readonly success: boolean;
  readonly meta: { readonly changes?: number; readonly changed_db?: boolean };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<{ count: number; duration: number }>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface R2Object {
  readonly key: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Objects {
  readonly objects: { key: string }[];
  readonly truncated: boolean;
  readonly cursor?: string;
}

export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<{ key: string } | null>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<R2Objects>;
}

export interface Queue<Body = unknown> {
  send(message: Body, options?: { delaySeconds?: number }): Promise<void>;
}

export interface MessageBatch<Body = unknown> {
  readonly messages: { readonly body: Body; ack(): void; retry(options?: { delaySeconds?: number }): void }[];
}

export interface Fetcher {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

export interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  readonly headers: Headers;
  readonly rawSize: number;
  setReject(reason: string): void;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledEvent {
  readonly cron: string;
  readonly scheduledTime: number;
}
