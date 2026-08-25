import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../db/client';
import { propertyImages, type NewPropertyImage, type PropertyImage } from '../db/schema';

/**
 * Property-image metadata access (B5). D1/Drizzle only — no R2 here.
 * All property-scoped lookups pass the propertyId so an image can never be
 * addressed outside its property.
 */

export async function insertImage(db: Database, values: NewPropertyImage): Promise<PropertyImage> {
  const [row] = await db.insert(propertyImages).values(values).returning();
  return row!;
}

export async function listByProperty(db: Database, propertyId: string): Promise<PropertyImage[]> {
  return db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, propertyId))
    .orderBy(asc(propertyImages.sortOrder), asc(propertyImages.createdAt))
    .all();
}

/**
 * Batch-load images for many properties (B17 discovery — avoids N+1 image
 * lookups). Ordered so the primary image (then lowest sortOrder) comes first
 * per property; the service picks the first per property id.
 */
export async function listByPropertyIds(
  db: Database,
  propertyIds: string[],
): Promise<PropertyImage[]> {
  if (propertyIds.length === 0) return [];
  return db
    .select()
    .from(propertyImages)
    .where(inArray(propertyImages.propertyId, propertyIds))
    .orderBy(
      desc(propertyImages.isPrimary),
      asc(propertyImages.sortOrder),
      asc(propertyImages.createdAt),
    )
    .all();
}

export async function countByProperty(db: Database, propertyId: string): Promise<number> {
  const rows = await db
    .select({ id: propertyImages.id })
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, propertyId))
    .all();
  return rows.length;
}

/** Find an image scoped to its property (id must belong to propertyId). */
export async function findByIdInProperty(
  db: Database,
  propertyId: string,
  imageId: string,
): Promise<PropertyImage | undefined> {
  return db
    .select()
    .from(propertyImages)
    .where(and(eq(propertyImages.id, imageId), eq(propertyImages.propertyId, propertyId)))
    .get();
}

export async function clearPrimary(db: Database, propertyId: string): Promise<void> {
  await db
    .update(propertyImages)
    .set({ isPrimary: false })
    .where(eq(propertyImages.propertyId, propertyId))
    .run();
}

export async function setPrimary(
  db: Database,
  propertyId: string,
  imageId: string,
  isPrimary: boolean,
): Promise<void> {
  await db
    .update(propertyImages)
    .set({ isPrimary })
    .where(and(eq(propertyImages.id, imageId), eq(propertyImages.propertyId, propertyId)))
    .run();
}

export async function setSortOrder(
  db: Database,
  propertyId: string,
  imageId: string,
  sortOrder: number,
): Promise<void> {
  await db
    .update(propertyImages)
    .set({ sortOrder })
    .where(and(eq(propertyImages.id, imageId), eq(propertyImages.propertyId, propertyId)))
    .run();
}

export async function deleteById(db: Database, propertyId: string, imageId: string): Promise<void> {
  await db
    .delete(propertyImages)
    .where(and(eq(propertyImages.id, imageId), eq(propertyImages.propertyId, propertyId)))
    .run();
}
