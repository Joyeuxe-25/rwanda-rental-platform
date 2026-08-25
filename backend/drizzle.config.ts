import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for Cloudflare D1 (SQLite dialect).
 *
 * PHASE B0-R: the schema directory exists but declares NO business tables yet,
 * so `npm run db:generate` produces no migrations until B1 adds the schema.
 *
 * Generated SQL migrations are written to `./migrations`, the same directory
 * Wrangler applies to D1 via `wrangler d1 migrations apply rwanda_rental`.
 *
 * No `driver`/credentials are configured here on purpose: migration generation
 * is offline, and applying migrations goes through Wrangler (local & remote),
 * so no Cloudflare account tokens are required during B0-R. Remote drizzle-kit
 * tooling (studio/push) can be configured with credentials in a later phase.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/index.ts',
  out: './migrations',
  verbose: true,
  strict: true,
});
