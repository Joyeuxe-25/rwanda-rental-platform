import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId, updatedAt } from './_shared';
import { properties } from './properties';
import { rentalRequests } from './rental-requests';
import { users } from './users';

/**
 * Rentals — the authoritative rental relationship between a tenant, a property,
 * and the property's landlord.
 *
 * CRITICAL RULE — one property may have AT MOST ONE active rental, while a
 * tenant may hold MANY active rentals across different properties. This is
 * enforced at the DB level by a PARTIAL UNIQUE INDEX on `property_id` limited to
 * `status = 'ACTIVE'` (SQLite supports partial indexes; D1 runs SQLite). The
 * property.status field is only a denormalized convenience — THIS index is the
 * source of truth for exclusivity. (The service layer additionally wraps
 * acceptance in a transaction, but the DB guarantees correctness regardless.)
 *
 * Status lifecycle: ACTIVE → COMPLETED | TERMINATED.
 *
 * Snapshot financials: `monthlyRent`/`securityDeposit` are copied onto the
 * rental at creation so historical records are immutable even if the landlord
 * later edits the property's advertised rent. Money is INTEGER whole RWF.
 *
 * Dates stored as epoch-ms integers (timestamp_ms). All FKs ON DELETE RESTRICT
 * to protect rental history.
 *
 * B7 conversion link: `rentalRequestId` references the ACCEPTED rental_request
 * a rental was created from. It is UNIQUE, so a given request can produce AT
 * MOST ONE rental — this is the DB-level "already converted" marker (a rental
 * existing for the request means it's consumed) and, together with the
 * one-active-rental-per-property index, makes conversion fully race-safe.
 */
export const rentals = sqliteTable(
  'rentals',
  {
    id: primaryId(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // The ACCEPTED request this rental was created from (B7). UNIQUE → one rental
    // per request. Nullable so historical/other rentals need not have one.
    rentalRequestId: text('rental_request_id')
      .references(() => rentalRequests.id, { onDelete: 'restrict', onUpdate: 'cascade' })
      .unique(),
    status: text('status', { enum: ['ACTIVE', 'COMPLETED', 'TERMINATED'] })
      .notNull()
      .default('ACTIVE'),
    startDate: integer('start_date', { mode: 'timestamp_ms' }).notNull(),
    endDate: integer('end_date', { mode: 'timestamp_ms' }),

    // Snapshot of agreed financials (whole RWF)
    monthlyRent: integer('monthly_rent').notNull(),
    securityDeposit: integer('security_deposit').notNull().default(0),
    currency: text('currency').notNull().default('RWF'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('rentals_status_check', sql`${t.status} IN ('ACTIVE', 'COMPLETED', 'TERMINATED')`),
    // The core exclusivity guarantee: at most one ACTIVE rental per property.
    uniqueIndex('rentals_one_active_per_property')
      .on(t.propertyId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index('rentals_tenant_idx').on(t.tenantId),
    index('rentals_property_idx').on(t.propertyId),
    index('rentals_landlord_idx').on(t.landlordId),
    index('rentals_status_idx').on(t.status),
  ],
);

export type Rental = typeof rentals.$inferSelect;
export type NewRental = typeof rentals.$inferInsert;
