import { and, asc, desc, eq, gte, like, lte, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../db/client';
import { properties, type NewProperty, type Property } from '../db/schema';

/**
 * Property data-access. Ownership is enforced IN THE QUERY (every management
 * lookup/mutation filters by `landlord_id`), so a landlord can never reach
 * another landlord's row even if the id is guessed.
 */

/** Columns a landlord may set on create/update (server-controlled cols excluded). */
export type PropertyWritableColumns = Partial<
  Pick<
    Property,
    | 'title'
    | 'description'
    | 'propertyType'
    | 'bedrooms'
    | 'bathrooms'
    | 'monthlyRent'
    | 'securityDeposit'
    | 'additionalCharges'
    | 'province'
    | 'district'
    | 'sector'
    | 'cell'
    | 'villageOrArea'
    | 'additionalLocation'
    | 'amenities'
  >
>;

export async function createProperty(db: Database, values: NewProperty): Promise<Property> {
  const [row] = await db.insert(properties).values(values).returning();
  return row!;
}

export async function findByIdForLandlord(
  db: Database,
  id: string,
  landlordId: string,
): Promise<Property | undefined> {
  return db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.landlordId, landlordId)))
    .get();
}

export async function listByLandlord(db: Database, landlordId: string): Promise<Property[]> {
  return db
    .select()
    .from(properties)
    .where(eq(properties.landlordId, landlordId))
    .orderBy(desc(properties.createdAt))
    .all();
}

export async function updateForLandlord(
  db: Database,
  id: string,
  landlordId: string,
  fields: PropertyWritableColumns,
): Promise<Property | undefined> {
  const [row] = await db
    .update(properties)
    .set(fields)
    .where(and(eq(properties.id, id), eq(properties.landlordId, landlordId)))
    .returning();
  return row;
}

export async function deleteForLandlord(
  db: Database,
  id: string,
  landlordId: string,
): Promise<void> {
  await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.landlordId, landlordId)))
    .run();
}

export async function setPublishedForLandlord(
  db: Database,
  id: string,
  landlordId: string,
  isPublished: boolean,
  publishedAt: Date | null,
): Promise<Property | undefined> {
  const [row] = await db
    .update(properties)
    .set({ isPublished, publishedAt })
    .where(and(eq(properties.id, id), eq(properties.landlordId, landlordId)))
    .returning();
  return row;
}

/** Unscoped lookup by id (caller decides how to interpret ownership/state). */
export async function findById(db: Database, id: string): Promise<Property | undefined> {
  return db.select().from(properties).where(eq(properties.id, id)).get();
}

/** Public lookup: only returns a property when it is published. */
export async function findPublishedById(db: Database, id: string): Promise<Property | undefined> {
  return db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.isPublished, true)))
    .get();
}

/** Full management representation (owner's view). */
export function toManagementProperty(p: Property) {
  return {
    id: p.id,
    landlordId: p.landlordId,
    title: p.title,
    description: p.description,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    monthlyRent: p.monthlyRent,
    securityDeposit: p.securityDeposit,
    otherCharges: p.additionalCharges,
    currency: p.currency,
    province: p.province,
    district: p.district,
    sector: p.sector,
    cell: p.cell,
    village: p.villageOrArea,
    additionalLocation: p.additionalLocation,
    amenities: p.amenities,
    status: p.status,
    isPublished: p.isPublished,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * Public listing representation — listing-safe fields only. The landlord is
 * reduced to id + display name (never email/phone/credentials).
 */
export interface PublicImage {
  id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

export function toPublicProperty(
  p: Property,
  landlord: { id: string; firstName: string; lastName: string },
  images: PublicImage[] = [],
) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    monthlyRent: p.monthlyRent,
    securityDeposit: p.securityDeposit,
    otherCharges: p.additionalCharges,
    currency: p.currency,
    province: p.province,
    district: p.district,
    sector: p.sector,
    cell: p.cell,
    village: p.villageOrArea,
    additionalLocation: p.additionalLocation,
    amenities: p.amenities,
    status: p.status,
    landlord: { id: landlord.id, firstName: landlord.firstName, lastName: landlord.lastName },
    images,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * Public list-card representation (B17). Same flat, listing-safe shape as
 * `toPublicProperty` (so the F2 `PropertyCard` consumes it directly), but omits
 * the full `description` to keep discovery payloads focused. `images` carries the
 * primary image only. Never exposes landlord contact details or storage keys.
 */
export function toPublicPropertyCard(
  p: Property,
  landlord: { id: string; firstName: string; lastName: string },
  images: PublicImage[] = [],
) {
  return {
    id: p.id,
    title: p.title,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    monthlyRent: p.monthlyRent,
    securityDeposit: p.securityDeposit,
    otherCharges: p.additionalCharges,
    currency: p.currency,
    province: p.province,
    district: p.district,
    sector: p.sector,
    cell: p.cell,
    village: p.villageOrArea,
    additionalLocation: p.additionalLocation,
    amenities: p.amenities,
    status: p.status,
    landlord: { id: landlord.id, firstName: landlord.firstName, lastName: landlord.lastName },
    images,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  };
}

// --- Public discovery (B17) --------------------------------------------------

export interface PublicPropertyFilters {
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  villageOrArea?: string;
  propertyType?: Property['propertyType'];
  status?: Property['status'];
  minRent?: number;
  maxRent?: number;
  bedrooms?: number;
  bathrooms?: number;
  q?: string;
  sort?: 'newest' | 'rent_asc' | 'rent_desc';
}

/** Build the WHERE clause: ALWAYS `is_published = true`, plus the given filters. */
function publicWhere(f: PublicPropertyFilters): SQL | undefined {
  const conds: SQL[] = [eq(properties.isPublished, true)];
  if (f.province) conds.push(eq(properties.province, f.province));
  if (f.district) conds.push(eq(properties.district, f.district));
  if (f.sector) conds.push(eq(properties.sector, f.sector));
  if (f.cell) conds.push(eq(properties.cell, f.cell));
  if (f.villageOrArea) conds.push(eq(properties.villageOrArea, f.villageOrArea));
  if (f.propertyType) conds.push(eq(properties.propertyType, f.propertyType));
  if (f.status) conds.push(eq(properties.status, f.status));
  if (f.minRent !== undefined) conds.push(gte(properties.monthlyRent, f.minRent));
  if (f.maxRent !== undefined) conds.push(lte(properties.monthlyRent, f.maxRent));
  if (f.bedrooms !== undefined) conds.push(eq(properties.bedrooms, f.bedrooms));
  if (f.bathrooms !== undefined) conds.push(eq(properties.bathrooms, f.bathrooms));
  if (f.q) {
    // Parameterized LIKE across safe public fields (values are bound, never
    // interpolated). Escape LIKE wildcards in user input for literal matching.
    const term = `%${f.q.replace(/[%_\\]/g, '\\$&')}%`;
    const match = or(
      like(properties.title, term),
      like(properties.description, term),
      like(properties.district, term),
      like(properties.sector, term),
      like(properties.villageOrArea, term),
    );
    if (match) conds.push(match);
  }
  return and(...conds);
}

function publicOrderBy(sort: PublicPropertyFilters['sort']): SQL[] {
  if (sort === 'rent_asc') return [asc(properties.monthlyRent), desc(properties.createdAt)];
  if (sort === 'rent_desc') return [desc(properties.monthlyRent), desc(properties.createdAt)];
  // Default: newest published first, then newest created (stable tiebreaker).
  return [desc(properties.publishedAt), desc(properties.createdAt)];
}

/**
 * Published-only, filtered, paginated property page + total count. Filtering,
 * sorting, and pagination all happen in the database (LIMIT/OFFSET) — never in
 * memory. Returns rows for the service to hydrate with landlord/image data.
 */
export async function findPublishedProperties(
  db: Database,
  filters: PublicPropertyFilters,
  page: number,
  limit: number,
): Promise<{ rows: Property[]; total: number }> {
  const where = publicWhere(filters);
  const rows = await db
    .select()
    .from(properties)
    .where(where)
    .orderBy(...publicOrderBy(filters.sort))
    .limit(limit)
    .offset((page - 1) * limit)
    .all();
  const countRow = await db
    .select({ c: sql<number>`count(*)` })
    .from(properties)
    .where(where)
    .get();
  return { rows, total: Number(countRow?.c ?? 0) };
}
