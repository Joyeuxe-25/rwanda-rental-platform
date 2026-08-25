import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId, updatedAt } from './_shared';
import { properties } from './properties';
import { rentals } from './rentals';
import { users } from './users';

/**
 * Payments — each payment belongs to a specific RENTAL (never merely to a
 * tenant). `tenantId`, `landlordId`, and `propertyId` are also stored
 * redundantly: they are derivable via the rental, but denormalizing them makes
 * financial reporting/reconciliation queries efficient and preserves an audit
 * trail even if a rental is later corrected. Cross-field consistency is the
 * service layer's responsibility.
 *
 * Providers: MTN_MOMO | AIRTEL_MONEY (no integrations/secrets/webhooks in B1).
 * Status: PENDING | SUCCESSFUL | FAILED | CANCELLED | EXPIRED.
 * Money: INTEGER whole RWF.
 *
 * Idempotency: `providerTransactionId` is not assumed globally unique across
 * providers, so uniqueness is enforced on the COMPOSITE (provider,
 * providerTransactionId) via a partial unique index limited to rows where the
 * transaction id is present (a PENDING payment may not have one yet).
 *
 * Payment period: `paymentPeriod` is a TEXT `YYYY-MM` string (e.g. "2026-08")
 * identifying the rental month covered — unambiguous and easy to query.
 * Duplicate successful payments for the same rental+period are NOT blocked at
 * the DB level, to allow legitimate corrections/refunds/retries; the service
 * layer handles period idempotency.
 *
 * Idempotency (B8): `idempotencyKey` (from the `Idempotency-Key` request header)
 * makes payment-creation retries safe. Uniqueness is scoped PER TENANT via a
 * partial unique index on `(tenant_id, idempotency_key)` — so a tenant's retry
 * returns their existing payment, and one tenant's key can never collide with
 * another's. It is nullable (historical/provider-created rows may lack one).
 *
 * All FKs ON DELETE RESTRICT — financial history must not be casually destroyed.
 */
export const payments = sqliteTable(
  'payments',
  {
    id: primaryId(),
    rentalId: text('rental_id')
      .notNull()
      .references(() => rentals.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('RWF'),
    paymentPeriod: text('payment_period').notNull(), // YYYY-MM

    provider: text('provider', { enum: ['MTN_MOMO', 'AIRTEL_MONEY'] }).notNull(),
    providerTransactionId: text('provider_transaction_id'),
    status: text('status', {
      enum: ['PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED'],
    })
      .notNull()
      .default('PENDING'),

    // Idempotency key from the `Idempotency-Key` header (B8). Unique per tenant.
    idempotencyKey: text('idempotency_key'),

    createdAt: createdAt(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('payments_provider_check', sql`${t.provider} IN ('MTN_MOMO', 'AIRTEL_MONEY')`),
    check(
      'payments_status_check',
      sql`${t.status} IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED')`,
    ),
    check('payments_amount_positive_check', sql`${t.amount} > 0`),
    // Idempotency: (provider, providerTransactionId) unique when the id exists.
    uniqueIndex('payments_provider_txn_unique')
      .on(t.provider, t.providerTransactionId)
      .where(sql`${t.providerTransactionId} IS NOT NULL`),
    // Idempotency: (tenant_id, idempotency_key) unique when the key exists.
    uniqueIndex('payments_tenant_idempotency_unique')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    index('payments_rental_idx').on(t.rentalId),
    index('payments_tenant_idx').on(t.tenantId),
    index('payments_landlord_idx').on(t.landlordId),
    index('payments_property_idx').on(t.propertyId),
    index('payments_status_idx').on(t.status),
    index('payments_txn_idx').on(t.providerTransactionId),
    index('payments_period_idx').on(t.rentalId, t.paymentPeriod),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
