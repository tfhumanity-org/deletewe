import { DatabaseSync } from 'node:sqlite';
import { EngineError, type Database, type SqlParam } from '@deletewe/engine';

type Row = Record<string, SqlParam>;

/**
 * SQLite via `node:sqlite`, so self-hosting needs no native build step.
 * The same migration set runs here and on D1 (ADR-0007).
 */
export class SqliteDatabase implements Database {
  constructor(
    private readonly handle: DatabaseSync,
    private readonly inTransaction = false,
  ) {}

  static open(path: string): SqliteDatabase {
    const handle = new DatabaseSync(path);
    handle.exec('PRAGMA journal_mode = WAL');
    handle.exec('PRAGMA foreign_keys = ON');
    handle.exec('PRAGMA busy_timeout = 5000');
    return new SqliteDatabase(handle);
  }

  static memory(): SqliteDatabase {
    return SqliteDatabase.open(':memory:');
  }

  async exec(sql: string): Promise<void> {
    this.handle.exec(sql);
  }

  async run(sql: string, params: readonly SqlParam[] = []): Promise<{ changes: number }> {
    const result = this.handle.prepare(sql).run(...this.bind(params));
    return { changes: Number(result.changes) };
  }

  async get<T>(sql: string, params: readonly SqlParam[] = []): Promise<T | undefined> {
    const row = this.handle.prepare(sql).get(...this.bind(params)) as Row | undefined;
    return row as T | undefined;
  }

  async all<T>(sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
    return this.handle.prepare(sql).all(...this.bind(params)) as T[];
  }

  async transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    this.handle.exec('BEGIN');
    try {
      const result = await fn(new SqliteDatabase(this.handle, true));
      this.handle.exec('COMMIT');
      return result;
    } catch (error) {
      this.handle.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.handle.close();
  }

  /** `node:sqlite` rejects `undefined` and wants `Uint8Array` for blobs. */
  private bind(params: readonly SqlParam[]): (string | number | null | Uint8Array)[] {
    return params.map((p) => {
      if (p === undefined) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });
  }
}

export async function openSqlite(path: string): Promise<SqliteDatabase> {
  try {
    return SqliteDatabase.open(path);
  } catch (error) {
    throw new EngineError('internal', `cannot open database at ${path}: ${String(error)}`);
  }
}
