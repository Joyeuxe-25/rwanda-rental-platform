import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { notifications, type NewNotification, type Notification } from '../db/schema';
import type { NotificationType } from '../db/schema';

/**
 * Notification data-access (B12). Ownership is enforced in the query — every
 * read/update filters by `user_id`. Idempotent creation relies on the partial
 * unique index `(user_id, event_key)` via `ON CONFLICT DO NOTHING`.
 */

export interface ListFilters {
  unread?: boolean;
  type?: NotificationType;
  limit: number;
  offset: number;
}

/**
 * Insert a notification, skipping silently if a notification with the same
 * `(user_id, event_key)` already exists (idempotent). Returns the created row,
 * or `undefined` when it was deduplicated.
 */
export async function insertIfNew(
  db: Database,
  values: NewNotification,
): Promise<Notification | undefined> {
  const rows = await db.insert(notifications).values(values).onConflictDoNothing().returning();
  return rows[0];
}

function whereForUser(userId: string, f: { unread?: boolean; type?: NotificationType }) {
  const conds = [eq(notifications.userId, userId)];
  if (f.unread !== undefined) conds.push(eq(notifications.isRead, !f.unread));
  if (f.type !== undefined) conds.push(eq(notifications.type, f.type));
  return and(...conds);
}

export async function listForUser(
  db: Database,
  userId: string,
  f: ListFilters,
): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(whereForUser(userId, f))
    .orderBy(desc(notifications.createdAt))
    .limit(f.limit)
    .offset(f.offset)
    .all();
}

export async function countForUser(
  db: Database,
  userId: string,
  f: { unread?: boolean; type?: NotificationType } = {},
): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(whereForUser(userId, f))
    .all();
  return rows.length;
}

export async function unreadCountForUser(db: Database, userId: string): Promise<number> {
  return countForUser(db, userId, { unread: true });
}

export async function findByIdForUser(
  db: Database,
  id: string,
  userId: string,
): Promise<Notification | undefined> {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .get();
}

/** Mark one owned notification read (idempotent — preserves an existing readAt). */
export async function markReadForUser(
  db: Database,
  id: string,
  userId: string,
  readAt: Date,
): Promise<Notification | undefined> {
  const existing = await findByIdForUser(db, id, userId);
  if (!existing) return undefined;
  if (existing.isRead) return existing; // idempotent
  const [row] = await db
    .update(notifications)
    .set({ isRead: true, readAt })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning();
  return row;
}

/** Mark all of a user's unread notifications read. Returns how many were updated. */
export async function markAllReadForUser(
  db: Database,
  userId: string,
  readAt: Date,
): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ isRead: true, readAt })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
    .returning();
  return updated.length;
}
