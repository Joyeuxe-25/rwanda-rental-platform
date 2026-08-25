import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId } from './_shared';
import { users } from './users';

/**
 * Sessions — server-side authentication sessions (B2).
 *
 * The raw session token is a cryptographically random value sent to the client
 * ONLY in an HttpOnly cookie. The database stores just the SHA-256 **hash** of
 * that token (`token_hash`, UNIQUE) — so a database leak does not expose usable
 * session tokens. Authentication hashes the presented cookie token and looks up
 * the row.
 *
 * A session is valid when: not past `expires_at` AND `revoked_at` IS NULL.
 * Logout sets `revoked_at`; expiry is enforced on lookup. Users may hold
 * multiple concurrent sessions (laptop, phone, ...). ON DELETE CASCADE removes
 * sessions with their user.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
