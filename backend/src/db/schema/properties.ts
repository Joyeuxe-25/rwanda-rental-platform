import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId, updatedAt } from './_shared';
import { users } from './users';

/**
 * Properties — each row is exactly ONE rental unit (MVP business rule). A
 * building with 5 rentable apartments is 5 independent property rows; there is
 * deliberately no Building→Units hierarchy.
 *
 * Ownership: `landlordId` → users.id (ON DELETE RESTRICT) — a landlord with
 * properties cannot be deleted, preserving integrity. Only the owner may modify
 * a property; that authorization is enforced at the service layer (B2+), not here.
 *
 * Money: INTEGER whole Rwandan Francs (RWF). RWF is not subdivided in practice,
 * and floats are never used for money. `currency` is stored explicitly
 * (default 'RWF') to keep records self-describing.
 *
 * Location: human-readable Rwandan administrative hierarchy — NO latitude/
 * longitude is required or stored. A future map feature can derive coordinates
 * separately.
 *
 * Status: AVAILABLE | OCCUPIED | UNAVAILABLE — a denormalized convenience for
 * listings/filtering. It is NOT the source of truth for occupancy: the
 * authoritative rule "one property ⇒ at most one ACTIVE rental" is enforced by
 * a partial unique index on the rentals table. OCCUPIED is set by the rental
 * flow (B7+), never by landlords directly.
 *
 * Publication (B4): `isPublished` controls PUBLIC discoverability and is
 * deliberately ORTHOGONAL to `status` — a property may be published AND
 * occupied (still discoverable), or unpublished (a private draft). New
 * properties start unpublished. `publishedAt` records when it first went public.
 *
 * Amenities: SQLite has no array type, so amenities are stored as a JSON TEXT
 * array (e.g. ["Parking","Water"]). A separate amenities table is unnecessary
 * for the MVP's read-mostly filtering needs.
 *
 * Soft delete: none. A property is taken off the public market by unpublishing
 * (`isPublished = false`) rather than deleting, so rental/payment history and
 * the listing itself are preserved.
 */
export const properties = sqliteTable(
  'properties',
  {
    id: primaryId(),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // Basic
    title: text('title').notNull(),
    description: text('description'),
    propertyType: text('property_type', {
      enum: ['APARTMENT', 'HOUSE', 'ROOM', 'STUDIO', 'OTHER'],
    }).notNull(),
    bedrooms: integer('bedrooms').notNull().default(0),
    bathrooms: integer('bathrooms').notNull().default(0),

    // Financial (whole RWF)
    monthlyRent: integer('monthly_rent').notNull(),
    securityDeposit: integer('security_deposit').notNull().default(0),
    additionalCharges: integer('additional_charges').notNull().default(0),
    currency: text('currency').notNull().default('RWF'),

    // Location (human-readable Rwandan hierarchy)
    province: text('province').notNull(),
    district: text('district').notNull(),
    sector: text('sector').notNull(),
    cell: text('cell'),
    villageOrArea: text('village_or_area'),
    additionalLocation: text('additional_location'),

    // Amenities as JSON text array
    amenities: text('amenities', { mode: 'json' }).$type<string[]>().notNull().default([]),

    status: text('status', { enum: ['AVAILABLE', 'OCCUPIED', 'UNAVAILABLE'] })
      .notNull()
      .default('AVAILABLE'),

    // Publication (B4) — public discoverability, orthogonal to `status`.
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'properties_type_check',
      sql`${t.propertyType} IN ('APARTMENT', 'HOUSE', 'ROOM', 'STUDIO', 'OTHER')`,
    ),
    check('properties_status_check', sql`${t.status} IN ('AVAILABLE', 'OCCUPIED', 'UNAVAILABLE')`),
    check('properties_rent_nonneg_check', sql`${t.monthlyRent} >= 0`),
    check('properties_deposit_nonneg_check', sql`${t.securityDeposit} >= 0`),
    index('properties_landlord_idx').on(t.landlordId),
    index('properties_status_idx').on(t.status),
    index('properties_type_idx').on(t.propertyType),
    index('properties_district_idx').on(t.district),
    index('properties_sector_idx').on(t.sector),
    index('properties_rent_idx').on(t.monthlyRent),
    index('properties_published_idx').on(t.isPublished),
    // Public discovery (B17): serves the exact `WHERE is_published = 1
    // ORDER BY published_at DESC` path of the public property list.
    index('properties_public_sort_idx').on(t.isPublished, t.publishedAt),
  ],
);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
