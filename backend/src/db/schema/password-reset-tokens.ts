import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId } from './_shared';
import { users } from './users';

/**
 * Password reset tokens — foundation for the password-reset flow (B2).
 *
 * As with sessions, only the SHA-256 **hash** of the random reset token is
 * stored (`token_hash`, UNIQUE); the raw token is never persisted or logged.
 * Tokens are single-use (`used_at` is set on consumption) and short-lived
 * (`expires_at`, e.g. 1 hour). A token is valid only when unused and unexpired.
 *
 * NOTE (B2): email delivery is NOT implemented — the record is created but no
 * message is sent. `forgot-password` never reveals whether an account exists.
 * ON DELETE CASCADE removes tokens with their user.
 */
export const passwordResetTokens = sqliteTable(
  'password_reset_tokens',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('password_reset_user_idx').on(t.userId),
    index('password_reset_expires_idx').on(t.expiresAt),
  ],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
