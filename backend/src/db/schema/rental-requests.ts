import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId, updatedAt } from './_shared';
import { properties } from './properties';
import { users } from './users';

/**
 * Rental requests — a tenant's attempt to rent a property. A request does NOT
 * itself create an active rental; acceptance (the rental flow, later) creates
 * the rentals row. Status lifecycle: PENDING → ACCEPTED | REJECTED | CANCELLED
 * (the `/approve` endpoint sets ACCEPTED — the B1 enum value). Only PENDING
 * requests may transition; enforcement lives in the service layer (B6).
 *
 * B6 invariant (DB-level): a tenant may have at most ONE *active* request per
 * property, where "active" = PENDING or ACCEPTED. This is enforced by a partial
 * unique index on (tenant_id, property_id), so a REJECTED/CANCELLED request
 * does not block a fresh one, and races cannot create duplicates.
 *
 * FKs use ON DELETE RESTRICT to preserve request history.
 */
export const rentalRequests = sqliteTable(
  'rental_requests',
  {
    id: primaryId(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    status: text('status', { enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'] })
      .notNull()
      .default('PENDING'),
    message: text('message'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'rental_requests_status_check',
      sql`${t.status} IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')`,
    ),
    // At most one active (PENDING/ACCEPTED) request per tenant+property.
    uniqueIndex('rental_requests_active_unique')
      .on(t.tenantId, t.propertyId)
      .where(sql`${t.status} IN ('PENDING', 'ACCEPTED')`),
    index('rental_requests_tenant_idx').on(t.tenantId),
    index('rental_requests_property_idx').on(t.propertyId),
    index('rental_requests_status_idx').on(t.status),
  ],
);

export type RentalRequest = typeof rentalRequests.$inferSelect;
export type NewRentalRequest = typeof rentalRequests.$inferInsert;
