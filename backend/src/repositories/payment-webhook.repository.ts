import { and, eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import {
  paymentProviderEvents,
  type NewPaymentProviderEvent,
  type PaymentProviderEvent,
} from '../db/schema';
import type { PaymentProviderName } from '../types/payment';

/**
 * Provider-event data-access (B9). No provider-specific logic; pure persistence
 * for dedup, correlation, and audit.
 */

export async function insertEvent(
  db: Database,
  values: NewPaymentProviderEvent,
): Promise<PaymentProviderEvent> {
  const [row] = await db.insert(paymentProviderEvents).values(values).returning();
  return row!;
}

/** Dedup lookup: by stable event id (if present) then by payload fingerprint. */
export async function findDuplicate(
  db: Database,
  provider: PaymentProviderName,
  externalEventId: string | null,
  payloadHash: string,
): Promise<PaymentProviderEvent | undefined> {
  if (externalEventId) {
    const byEvent = await db
      .select()
      .from(paymentProviderEvents)
      .where(
        and(
          eq(paymentProviderEvents.provider, provider),
          eq(paymentProviderEvents.externalEventId, externalEventId),
        ),
      )
      .get();
    if (byEvent) return byEvent;
  }
  return db
    .select()
    .from(paymentProviderEvents)
    .where(
      and(
        eq(paymentProviderEvents.provider, provider),
        eq(paymentProviderEvents.payloadHash, payloadHash),
      ),
    )
    .get();
}

export async function findById(
  db: Database,
  id: string,
): Promise<PaymentProviderEvent | undefined> {
  return db.select().from(paymentProviderEvents).where(eq(paymentProviderEvents.id, id)).get();
}

export async function markProcessed(db: Database, id: string, paymentId: string): Promise<void> {
  await db
    .update(paymentProviderEvents)
    .set({ processingStatus: 'PROCESSED', paymentId, processedAt: new Date() })
    .where(eq(paymentProviderEvents.id, id))
    .run();
}

export async function markUnmatched(db: Database, id: string): Promise<void> {
  await db
    .update(paymentProviderEvents)
    .set({ processingStatus: 'UNMATCHED', processedAt: new Date() })
    .where(eq(paymentProviderEvents.id, id))
    .run();
}

export async function markFailed(
  db: Database,
  id: string,
  errorCode: string,
  paymentId: string | null,
): Promise<void> {
  await db
    .update(paymentProviderEvents)
    .set({
      processingStatus: 'FAILED',
      processingErrorCode: errorCode,
      paymentId: paymentId ?? undefined,
      processedAt: new Date(),
    })
    .where(eq(paymentProviderEvents.id, id))
    .run();
}
