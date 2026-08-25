import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';

import type { Bindings } from '../types';
import * as schema from './schema';

/**
 * Database access foundation.
 *
 * Creates a Drizzle client bound to the request's D1 database. Services and
 * repositories (added in later phases) should depend on this rather than
 * reaching into the raw Cloudflare env object, keeping the app decoupled from
 * the runtime binding.
 *
 * Usage (later phases):
 *   const db = getDb(c.env);
 *   const rows = await db.select().from(someTable);
 */
export type Database = DrizzleD1Database<typeof schema>;

export function getDb(env: Bindings): Database {
  return drizzle(env.DB, { schema });
}
