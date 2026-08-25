import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId } from './_shared';
import { properties } from './properties';

/**
 * Property images — metadata/reference only. The actual image binaries live in
 * Cloudflare R2 (bucket binding `ASSETS`); this table stores the R2 `objectKey`
 * and an optional resolved `url`. No upload logic exists in B1.
 *
 * Relationship: propertyId → properties.id, ON DELETE CASCADE. Images are wholly
 * dependent on their property (not financial/historical data), so removing a
 * property removes its image rows; the corresponding R2 objects are cleaned up
 * by the service layer later.
 *
 * Primary image: `isPrimary` marks the cover image. SQLite/D1 cannot express
 * "at most one primary per property" as cleanly as a Postgres partial unique
 * index without edge cases, so uniqueness of the primary image is enforced at
 * the SERVICE layer (B5) — documented here rather than over-engineered in SQL.
 *
 * B5 upload metadata: `originalName` (sanitized source filename), `mimeType`
 * (detected from file magic bytes, not the client header), and `size` (bytes)
 * were added to describe the stored R2 object. `objectKey` is the server-
 * generated R2 key; the raw key is never exposed publicly.
 */
export const propertyImages = sqliteTable(
  'property_images',
  {
    id: primaryId(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    objectKey: text('object_key').notNull(),
    url: text('url'),
    originalName: text('original_name'),
    mimeType: text('mime_type'),
    size: integer('size'),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('property_images_property_idx').on(t.propertyId),
    index('property_images_primary_idx').on(t.propertyId, t.isPrimary),
  ],
);

export type PropertyImage = typeof propertyImages.$inferSelect;
export type NewPropertyImage = typeof propertyImages.$inferInsert;
