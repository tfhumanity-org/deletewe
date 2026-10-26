import type { Database, SqlParam } from '@deletewe/engine';
import type { D1Database } from './cf-types.ts';

/**
 * D1 is SQLite, so the same migration set and the same SQL run here and on a
 * self-hosted instance. See docs/adr/0007-sqlite-dialect-for-both-targets.md.
 */
export class D1Adapter implements Database {
  constructor(private readonly db: D1Database) {}

  async exec(sql: string): Promise<void> {
    // D1's exec() takes one statement per line; our migrations are multi-line
    // CREATE statements, so run them as prepared statements instead.
    for (const statement of splitStatements(sql)) {
      await this.db.prepare(statement).run();
    }
  }

  async run(sql: string, params: readonly SqlParam[] = []): Promise<{ changes: number }> {
    const result = await this.db.prepare(sql).bind(...bind(params)).run();
    return { changes: result.meta.changes ?? 0 };
  }

  async get<T>(sql: string, params: readonly SqlParam[] = []): Promise<T | undefined> {
    const row = await this.db.prepare(sql).bind(...bind(params)).first<T>();
    return row ?? undefined;
  }

  async all<T>(sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
    return (await this.db.prepare(sql).bind(...bind(params)).all<T>()).results;
  }

  /**
   * D1 has no interactive transaction, so this is a logical grouping only.
   * Every write path in the engine is idempotent rather than relying on
   * rollback, which is why that is survivable. See ADR-0007.
   */
  async transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

function bind(params: readonly SqlParam[]): unknown[] {
  return params.map((p) => (p instanceof Uint8Array ? [...p] : p));
}

/** Splits a migration script on semicolons that end a statement. */
export function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}
