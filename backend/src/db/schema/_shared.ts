import { sql } from 'drizzle-orm';
import { integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Shared column builders — keep ID and timestamp conventions consistent across
 * every table (documented once here rather than duplicated per file).
 *
 * ID strategy: UUID stored as TEXT. Generated app-side via `crypto.randomUUID()`
 * (available in the Workers runtime and Node). UUIDs are chosen over
 * auto-increment integers because they are safe to expose in REST URLs, stable
 * as foreign keys, and collision-free across a distributed/serverless runtime
 * where no central sequence is desirable.
 *
 * Timestamp strategy: stored as INTEGER Unix-epoch **milliseconds**, mapped by
 * Drizzle's `timestamp_ms` mode to/from JS `Date`. This is unambiguous, sorts
 * correctly, needs no timezone parsing, and serializes cleanly to ISO-8601 in
 * REST responses later. DB-level default `unixepoch() * 1000` fills the value
 * even for raw SQL inserts; `updated_at` additionally refreshes on Drizzle
 * updates via `$onUpdateFn`.
 */

/** Primary key: UUID text, generated on insert. */
export const primaryId = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** created_at: epoch-ms integer, defaults to now. */
export const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/** updated_at: epoch-ms integer, defaults to now and refreshes on update. */
export const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdateFn(() => new Date());
