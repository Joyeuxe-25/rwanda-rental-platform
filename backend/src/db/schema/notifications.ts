import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId } from './_shared';
import { users } from './users';

/**
 * Notifications — each belongs to exactly one user (ON DELETE CASCADE: a user's
 * notifications are ephemeral and removed with the user). Channel is IN-APP only
 * (B12); no email/SMS/push.
 *
 * `type` is CHECK-constrained to the known event categories. `relatedEntityType`
 * / `relatedEntityId` form a loose polymorphic reference (e.g. RENTAL_REQUEST +
 * its id) so the frontend can deep-link; no hard FK is used because the target
 * table varies.
 *
 * B12 idempotency: `eventKey` is a deterministic per-(recipient, business-event)
 * key (e.g. `pay_success:<paymentId>`). The partial unique index on
 * `(user_id, event_key)` guarantees ONE notification per recipient per business
 * event — a retried business action / duplicate provider webhook cannot create a
 * second notification, while a DIFFERENT event (different key) still can, and two
 * recipients of the same event each get their own row (different user_id).
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: primaryId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    type: text('type', {
      enum: [
        'RENTAL_REQUEST_SUBMITTED',
        'NEW_RENTAL_REQUEST',
        'RENTAL_REQUEST_ACCEPTED',
        'RENTAL_REQUEST_REJECTED',
        'RENTAL_REQUEST_CANCELLED',
        'RENTAL_ACTIVATED',
        'RENTAL_COMPLETED',
        'RENTAL_TERMINATED',
        'PAYMENT_INITIATED',
        'PAYMENT_SUCCESSFUL',
        'PAYMENT_RECEIVED',
        'PAYMENT_FAILED',
        'RENT_REMINDER',
      ],
    }).notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: text('related_entity_id'),
    // Deterministic idempotency key for business-event dedup (B12). Nullable so
    // ad-hoc notifications need not have one.
    eventKey: text('event_key'),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    check(
      'notifications_type_check',
      sql`${t.type} IN ('RENTAL_REQUEST_SUBMITTED','NEW_RENTAL_REQUEST','RENTAL_REQUEST_ACCEPTED','RENTAL_REQUEST_REJECTED','RENTAL_REQUEST_CANCELLED','RENTAL_ACTIVATED','RENTAL_COMPLETED','RENTAL_TERMINATED','PAYMENT_INITIATED','PAYMENT_SUCCESSFUL','PAYMENT_RECEIVED','PAYMENT_FAILED','RENT_REMINDER')`,
    ),
    // One notification per recipient per business event.
    uniqueIndex('notifications_user_event_unique')
      .on(t.userId, t.eventKey)
      .where(sql`${t.eventKey} IS NOT NULL`),
    index('notifications_user_idx').on(t.userId),
    index('notifications_read_idx').on(t.isRead),
    index('notifications_created_idx').on(t.createdAt),
    index('notifications_user_read_idx').on(t.userId, t.isRead),
    // Efficient newest-first pagination per user.
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationType = Notification['type'];
