import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId, updatedAt } from './_shared';
import { payments } from './payments';

/**
 * Payment provider events (B9) — an audit + idempotency log of provider
 * webhook/callback deliveries. Events are NOT payments; they are the raw signal
 * a future provider integration (B10 MTN / B11 Airtel) will send. This table
 * lets the webhook pipeline deduplicate, correlate to a payment, and reconcile.
 *
 * We deliberately DO NOT store raw provider payloads (they may carry personal/
 * financial data and secrets). Instead we keep normalized, non-sensitive
 * metadata plus a SHA-256 `payloadHash` used purely for replay/duplicate
 * detection (a fingerprint, never an authenticator).
 *
 * Deduplication: unique `(provider, payload_hash)` (a re-delivered payload has
 * the same hash) AND partial-unique `(provider, external_event_id)` when the
 * provider supplies a stable event id. Together these make processing idempotent
 * even under retries/races.
 *
 * Processing lifecycle: RECEIVED → PROCESSED | UNMATCHED | FAILED. Verification
 * failures are NOT persisted (avoids a DB-flooding vector); a row is created
 * only after the provider signature is verified.
 */
export const paymentProviderEvents = sqliteTable(
  'payment_provider_events',
  {
    id: primaryId(),
    provider: text('provider', { enum: ['MTN_MOMO', 'AIRTEL_MONEY'] }).notNull(),
    // Provider's stable event id (nullable — not all providers supply one).
    externalEventId: text('external_event_id'),
    // Provider transaction id used to correlate to an internal payment.
    externalTransactionId: text('external_transaction_id'),
    // Set once the event is correlated to a payment (nullable until then).
    paymentId: text('payment_id').references(() => payments.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // The internal PaymentStatus the event maps to (as reported by the adapter).
    eventStatus: text('event_status'),
    processingStatus: text('processing_status', {
      enum: ['RECEIVED', 'PROCESSED', 'UNMATCHED', 'FAILED'],
    })
      .notNull()
      .default('RECEIVED'),
    processingErrorCode: text('processing_error_code'),
    // SHA-256 hex of the raw body — fingerprint for replay/dedup only.
    payloadHash: text('payload_hash').notNull(),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('ppe_provider_check', sql`${t.provider} IN ('MTN_MOMO', 'AIRTEL_MONEY')`),
    check(
      'ppe_processing_check',
      sql`${t.processingStatus} IN ('RECEIVED', 'PROCESSED', 'UNMATCHED', 'FAILED')`,
    ),
    // Dedup: a re-delivered payload (same bytes) is rejected by the unique hash.
    uniqueIndex('ppe_provider_payload_unique').on(t.provider, t.payloadHash),
    // Dedup: a stable event id, when present, is unique per provider.
    uniqueIndex('ppe_provider_event_unique')
      .on(t.provider, t.externalEventId)
      .where(sql`${t.externalEventId} IS NOT NULL`),
    index('ppe_payment_idx').on(t.paymentId),
    index('ppe_txn_idx').on(t.provider, t.externalTransactionId),
    index('ppe_processing_idx').on(t.processingStatus),
  ],
);

export type PaymentProviderEvent = typeof paymentProviderEvents.$inferSelect;
export type NewPaymentProviderEvent = typeof paymentProviderEvents.$inferInsert;
