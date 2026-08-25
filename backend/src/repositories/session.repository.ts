import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from '../db/client';
import { sessions, type Session } from '../db/schema';

/**
 * Session data-access. Only hashed tokens are ever stored/looked up.
 */

export async function createSession(
  db: Database,
  values: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<Session> {
  const [row] = await db
    .insert(sessions)
    .values({ ...values, lastUsedAt: new Date() })
    .returning();
  return row!;
}

export async function findSessionByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<Session | undefined> {
  return db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
}

export async function touchSession(db: Database, id: string): Promise<void> {
  await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, id)).run();
}

/** Revoke a single session (logout). */
export async function revokeSession(db: Database, id: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
    .run();
}

/** Revoke ALL of a user's active sessions (password change/reset). */
export async function revokeAllUserSessions(db: Database, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .run();
}
