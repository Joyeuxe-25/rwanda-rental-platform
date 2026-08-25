import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Minimal typing for the subset of the `node:sqlite` API used by the tests.
 * Declared locally so the tests do not depend on `node:sqlite` type
 * declarations (not all @types/node versions ship them yet).
 */
export interface TestStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}
export interface TestDb {
  exec(sql: string): void;
  prepare(sql: string): TestStatement;
  close(): void;
}

// `node:sqlite` is a newer Node built-in that Vite/Vitest's bundler does not yet
// recognize as external, so a static `import` fails to resolve at transform
// time. Loading it through a runtime `require` sidesteps the bundler entirely.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (path: string) => TestDb;
};

/**
 * Test database helper.
 *
 * Spins up an in-memory SQLite database (the same engine Cloudflare D1 runs)
 * and applies the ACTUAL generated Drizzle migration SQL from `./migrations`.
 * This means the constraint tests exercise the real schema — foreign keys,
 * CHECK constraints, unique + partial-unique indexes — exactly as they will
 * exist in D1, rather than a hand-written or mocked approximation.
 *
 * Foreign-key enforcement is enabled explicitly (SQLite requires
 * `PRAGMA foreign_keys = ON`; D1 enforces FKs, so this mirrors production).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', '..', 'migrations');

export function createTestDb(): TestDb {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    // Drizzle separates statements with a `--> statement-breakpoint` marker.
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      db.exec(statement);
    }
  }

  return db;
}

/** Milliseconds since epoch — matches the schema's integer timestamp_ms columns. */
export function now(): number {
  return Date.now();
}

let counter = 0;
/** Small helper for unique-ish ids in tests (deterministic, no crypto needed). */
export function testId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}
