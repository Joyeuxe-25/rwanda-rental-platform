import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from '../db/client';
import { passwordResetTokens, type PasswordResetToken } from '../db/schema';

/**
 * Password-reset-token data-access. Only hashed tokens are stored/looked up.
 */

export async function createResetToken(
  db: Database,
  values: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<PasswordResetToken> {
  const [row] = await db.insert(passwordResetTokens).values(values).returning();
  return row!;
}

export async function findResetByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<PasswordResetToken | undefined> {
  return db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .get();
}

/** Mark a token consumed (single-use). */
export async function markResetTokenUsed(db: Database, id: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, id))
    .run();
}

/** Invalidate any outstanding (unused) reset tokens for a user. */
export async function invalidateUserResetTokens(db: Database, userId: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)))
    .run();
}
