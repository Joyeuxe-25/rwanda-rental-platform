import type { Database } from '../db/client';
import type { Notification, NotificationType } from '../db/schema';
import { logger } from '../lib/logger';
import * as repo from '../repositories/notification.repository';
import { ApiError } from '../utils/ApiError';

/**
 * Notification service (B12) — IN-APP notifications only (no email/SMS/push).
 *
 * Notifications are a SECONDARY, user-facing delivery record; they are never the
 * source of truth for a business event. All event helpers are wrapped so a
 * notification failure is logged and swallowed — it can NEVER roll back or
 * corrupt the authoritative rental/payment state (failure isolation).
 *
 * Idempotency: every business-event notification carries a deterministic
 * `eventKey` (e.g. `pay_success:<paymentId>`); the DB partial-unique index on
 * `(user_id, event_key)` guarantees one notification per recipient per event, so
 * a retried action / duplicate provider webhook never duplicates a notification.
 */

// --- Serializer --------------------------------------------------------------

/** Safe, client-facing shape — no userId, no eventKey, no internal fields. */
export function toSafeNotification(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    relatedEntityType: n.relatedEntityType,
    relatedEntityId: n.relatedEntityId,
    isRead: n.isRead,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

export type RelatedEntityType = 'PROPERTY' | 'RENTAL_REQUEST' | 'RENTAL' | 'PAYMENT';

interface CreateInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  eventKey?: string;
  relatedEntityType?: RelatedEntityType;
  relatedEntityId?: string;
}

/** Low-level create (idempotent on eventKey). Returns the row or undefined (deduped). */
export async function createNotification(
  db: Database,
  input: CreateInput,
): Promise<Notification | undefined> {
  return repo.insertIfNew(db, {
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    eventKey: input.eventKey ?? null,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
  });
}

/**
 * Run a notification side-effect with FULL failure isolation: any error is
 * logged (safe metadata only) and swallowed. Business callers `await` this
 * AFTER their authoritative transaction has committed.
 */
async function safeNotify(op: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error('notification.create_failed', {
      op,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

function rwf(amount: number): string {
  return `${amount.toLocaleString('en-US')} RWF`;
}

// --- Business-event helpers (all failure-isolated + idempotent) --------------

export async function notifyRentalRequestSubmitted(
  db: Database,
  p: { requestId: string; propertyTitle: string; tenantId: string; landlordId: string },
): Promise<void> {
  await safeNotify('rental_request_submitted', async () => {
    await createNotification(db, {
      userId: p.tenantId,
      type: 'RENTAL_REQUEST_SUBMITTED',
      eventKey: `rr_submitted:${p.requestId}`,
      relatedEntityType: 'RENTAL_REQUEST',
      relatedEntityId: p.requestId,
      title: 'Rental request submitted',
      message: `Your rental request for "${p.propertyTitle}" has been submitted.`,
    });
    await createNotification(db, {
      userId: p.landlordId,
      type: 'NEW_RENTAL_REQUEST',
      eventKey: `rr_new:${p.requestId}`,
      relatedEntityType: 'RENTAL_REQUEST',
      relatedEntityId: p.requestId,
      title: 'New rental request',
      message: `You have a new rental request for "${p.propertyTitle}".`,
    });
  });
}

export async function notifyRentalRequestAccepted(
  db: Database,
  p: { requestId: string; propertyTitle: string; tenantId: string },
): Promise<void> {
  await safeNotify('rental_request_accepted', () =>
    createNotification(db, {
      userId: p.tenantId,
      type: 'RENTAL_REQUEST_ACCEPTED',
      eventKey: `rr_accepted:${p.requestId}`,
      relatedEntityType: 'RENTAL_REQUEST',
      relatedEntityId: p.requestId,
      title: 'Rental request accepted',
      message: `Your rental request for "${p.propertyTitle}" was accepted.`,
    }),
  );
}

export async function notifyRentalRequestRejected(
  db: Database,
  p: { requestId: string; propertyTitle: string; tenantId: string },
): Promise<void> {
  await safeNotify('rental_request_rejected', () =>
    createNotification(db, {
      userId: p.tenantId,
      type: 'RENTAL_REQUEST_REJECTED',
      eventKey: `rr_rejected:${p.requestId}`,
      relatedEntityType: 'RENTAL_REQUEST',
      relatedEntityId: p.requestId,
      title: 'Rental request rejected',
      message: `Your rental request for "${p.propertyTitle}" was rejected.`,
    }),
  );
}

export async function notifyRentalRequestCancelled(
  db: Database,
  p: { requestId: string; propertyTitle: string; landlordId: string },
): Promise<void> {
  await safeNotify('rental_request_cancelled', () =>
    createNotification(db, {
      userId: p.landlordId,
      type: 'RENTAL_REQUEST_CANCELLED',
      eventKey: `rr_cancelled:${p.requestId}`,
      relatedEntityType: 'RENTAL_REQUEST',
      relatedEntityId: p.requestId,
      title: 'Rental request cancelled',
      message: `A rental request for "${p.propertyTitle}" was cancelled by the tenant.`,
    }),
  );
}

export async function notifyRentalActivated(
  db: Database,
  p: { rentalId: string; propertyTitle: string; tenantId: string; landlordId: string },
): Promise<void> {
  await safeNotify('rental_activated', async () => {
    await createNotification(db, {
      userId: p.tenantId,
      type: 'RENTAL_ACTIVATED',
      eventKey: `rental_activated:${p.rentalId}`,
      relatedEntityType: 'RENTAL',
      relatedEntityId: p.rentalId,
      title: 'Rental started',
      message: `Your rental for "${p.propertyTitle}" is now active.`,
    });
    await createNotification(db, {
      userId: p.landlordId,
      type: 'RENTAL_ACTIVATED',
      eventKey: `rental_activated:${p.rentalId}`,
      relatedEntityType: 'RENTAL',
      relatedEntityId: p.rentalId,
      title: 'Rental started',
      message: `A rental for "${p.propertyTitle}" is now active.`,
    });
  });
}

export async function notifyRentalEnded(
  db: Database,
  p: {
    rentalId: string;
    propertyTitle: string;
    tenantId: string;
    landlordId: string;
    kind: 'COMPLETED' | 'TERMINATED';
  },
): Promise<void> {
  const type: NotificationType = p.kind === 'COMPLETED' ? 'RENTAL_COMPLETED' : 'RENTAL_TERMINATED';
  const word = p.kind === 'COMPLETED' ? 'completed' : 'terminated';
  await safeNotify(`rental_${word}`, async () => {
    for (const [userId, subject] of [
      [p.tenantId, 'Your'],
      [p.landlordId, 'A'],
    ] as const) {
      await createNotification(db, {
        userId,
        type,
        eventKey: `rental_${word}:${p.rentalId}`,
        relatedEntityType: 'RENTAL',
        relatedEntityId: p.rentalId,
        title: `Rental ${word}`,
        message: `${subject} rental for "${p.propertyTitle}" was ${word}.`,
      });
    }
  });
}

interface PaymentContext {
  paymentId: string;
  tenantId: string;
  landlordId: string;
  amount: number;
  currency: string;
  paymentPeriod: string;
  provider: string;
}

export async function notifyPaymentInitiated(db: Database, p: PaymentContext): Promise<void> {
  await safeNotify('payment_initiated', () =>
    createNotification(db, {
      userId: p.tenantId,
      type: 'PAYMENT_INITIATED',
      eventKey: `pay_initiated:${p.paymentId}`,
      relatedEntityType: 'PAYMENT',
      relatedEntityId: p.paymentId,
      title: 'Payment started',
      message: `Your ${rwf(p.amount)} payment for ${p.paymentPeriod} via ${p.provider} has been started.`,
    }),
  );
}

export async function notifyPaymentSuccessful(db: Database, p: PaymentContext): Promise<void> {
  await safeNotify('payment_successful', async () => {
    await createNotification(db, {
      userId: p.tenantId,
      type: 'PAYMENT_SUCCESSFUL',
      eventKey: `pay_success:${p.paymentId}`,
      relatedEntityType: 'PAYMENT',
      relatedEntityId: p.paymentId,
      title: 'Payment successful',
      message: `Your ${rwf(p.amount)} payment for ${p.paymentPeriod} was successful.`,
    });
    await createNotification(db, {
      userId: p.landlordId,
      type: 'PAYMENT_RECEIVED',
      eventKey: `pay_received:${p.paymentId}`,
      relatedEntityType: 'PAYMENT',
      relatedEntityId: p.paymentId,
      title: 'Payment received',
      message: `You received a ${rwf(p.amount)} payment for ${p.paymentPeriod}.`,
    });
  });
}

export async function notifyPaymentFailed(db: Database, p: PaymentContext): Promise<void> {
  await safeNotify('payment_failed', async () => {
    await createNotification(db, {
      userId: p.tenantId,
      type: 'PAYMENT_FAILED',
      eventKey: `pay_failed_tenant:${p.paymentId}`,
      relatedEntityType: 'PAYMENT',
      relatedEntityId: p.paymentId,
      title: 'Payment failed',
      message: `Your ${rwf(p.amount)} payment for ${p.paymentPeriod} failed.`,
    });
    await createNotification(db, {
      userId: p.landlordId,
      type: 'PAYMENT_FAILED',
      eventKey: `pay_failed_landlord:${p.paymentId}`,
      relatedEntityType: 'PAYMENT',
      relatedEntityId: p.paymentId,
      title: 'Payment failed',
      message: `A ${rwf(p.amount)} payment for ${p.paymentPeriod} failed.`,
    });
  });
}

/**
 * Rent-reminder helper (B12 prepares the type; SCHEDULING is deferred — there is
 * no cron/queue/scheduled Worker in B12). Callable manually/by a later phase.
 */
export async function notifyRentReminder(
  db: Database,
  p: { rentalId: string; userId: string; propertyTitle: string; period: string },
): Promise<void> {
  await safeNotify('rent_reminder', () =>
    createNotification(db, {
      userId: p.userId,
      type: 'RENT_REMINDER',
      eventKey: `rent_reminder:${p.rentalId}:${p.period}`,
      relatedEntityType: 'RENTAL',
      relatedEntityId: p.rentalId,
      title: 'Rent reminder',
      message: `Rent for "${p.propertyTitle}" (${p.period}) is due.`,
    }),
  );
}

// --- Read / list management (API) --------------------------------------------

export interface ListQuery {
  page: number;
  limit: number;
  unread?: boolean;
  type?: NotificationType;
}

export async function list(db: Database, userId: string, q: ListQuery) {
  const offset = (q.page - 1) * q.limit;
  const [rows, total, unreadCount] = await Promise.all([
    repo.listForUser(db, userId, { unread: q.unread, type: q.type, limit: q.limit, offset }),
    repo.countForUser(db, userId, { unread: q.unread, type: q.type }),
    repo.unreadCountForUser(db, userId),
  ]);
  return {
    notifications: rows.map(toSafeNotification),
    unreadCount,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    },
  };
}

export async function getOne(db: Database, userId: string, id: string) {
  const n = await repo.findByIdForUser(db, id, userId);
  if (!n) throw ApiError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
  return toSafeNotification(n);
}

export async function markOneRead(db: Database, userId: string, id: string) {
  const n = await repo.markReadForUser(db, id, userId, new Date());
  if (!n) throw ApiError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
  return toSafeNotification(n);
}

export async function markAllRead(db: Database, userId: string) {
  const updated = await repo.markAllReadForUser(db, userId, new Date());
  return { updated };
}
