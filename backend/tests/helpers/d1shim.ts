import type { TestDb, TestStatement } from './testDb';

/**
 * A minimal `D1Database`-shaped shim backed by `node:sqlite`.
 *
 * This lets the auth tests exercise the REAL production path — Hono routes →
 * controllers → services → repositories → `getDb(env)` → `drizzle-orm/d1` →
 * (this shim) → SQLite — rather than mocking the database. It implements only
 * the subset of the D1 API that Drizzle's D1 driver actually calls
 * (`prepare`, `bind`, `run`, `all`, `raw`, and `batch`).
 */

function coerceParam(p: unknown): unknown {
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (p === undefined) return null;
  return p;
}

class ShimStatement {
  constructor(
    private readonly db: TestDb,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): ShimStatement {
    return new ShimStatement(this.db, this.sql, params.map(coerceParam));
  }

  private stmt(): TestStatement {
    return this.db.prepare(this.sql);
  }

  async run(): Promise<{ success: true; meta: Record<string, unknown>; results: unknown[] }> {
    const info = this.stmt().run(...this.params);
    return {
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
      results: [],
    };
  }

  async all(): Promise<{ success: true; meta: Record<string, unknown>; results: unknown[] }> {
    const results = this.stmt().all(...this.params);
    return { success: true, meta: {}, results };
  }

  async raw(): Promise<unknown[][]> {
    const results = this.stmt().all(...this.params);
    return results.map((row) => Object.values(row));
  }

  async first(column?: string): Promise<unknown> {
    const row = this.stmt().get(...this.params);
    if (row === undefined) return null;
    return column ? (row[column] ?? null) : row;
  }
}

export class D1Shim {
  constructor(private readonly db: TestDb) {}

  prepare(sql: string): ShimStatement {
    return new ShimStatement(this.db, sql);
  }

  async batch(statements: ShimStatement[]): Promise<unknown[]> {
    this.db.exec('BEGIN');
    try {
      const out: unknown[] = [];
      for (const s of statements) out.push(await s.all());
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
}
