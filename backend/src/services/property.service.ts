import type { Database } from '../db/client';
import type { Property } from '../db/schema';
import * as imageRepo from '../repositories/property-image.repository';
import * as propertyRepo from '../repositories/property.repository';
import * as userRepo from '../repositories/user.repository';
import * as imageService from './property-image.service';
import { ApiError } from '../utils/ApiError';
import type {
  CreatePropertyInput,
  ListPublicPropertiesQuery,
  UpdatePropertyInput,
} from '../validators/property.validators';

/**
 * Property service (B4). Ownership is derived from the authenticated landlord id
 * (passed by the controller from the session) — never from the request body.
 * Column writes are constructed via an explicit allowlist (no body spreading),
 * so server-controlled fields (landlordId, status, isPublished, currency, id,
 * timestamps) can never be mass-assigned. No transactions (D1-compatible).
 */

/** Map validated create input → DB columns (explicit allowlist). */
function createColumns(input: CreatePropertyInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    propertyType: input.propertyType,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    monthlyRent: input.monthlyRent,
    securityDeposit: input.securityDeposit,
    additionalCharges: input.otherCharges,
    province: input.province,
    district: input.district,
    sector: input.sector,
    cell: input.cell ?? null,
    villageOrArea: input.village ?? null,
    additionalLocation: input.additionalLocation ?? null,
    amenities: input.amenities,
  };
}

/** Map validated update input → DB columns (only provided keys; explicit). */
function updateColumns(input: UpdatePropertyInput): propertyRepo.PropertyWritableColumns {
  const cols: propertyRepo.PropertyWritableColumns = {};
  if (input.title !== undefined) cols.title = input.title;
  if (input.description !== undefined) cols.description = input.description;
  if (input.propertyType !== undefined) cols.propertyType = input.propertyType;
  if (input.bedrooms !== undefined) cols.bedrooms = input.bedrooms;
  if (input.bathrooms !== undefined) cols.bathrooms = input.bathrooms;
  if (input.monthlyRent !== undefined) cols.monthlyRent = input.monthlyRent;
  if (input.securityDeposit !== undefined) cols.securityDeposit = input.securityDeposit;
  if (input.otherCharges !== undefined) cols.additionalCharges = input.otherCharges;
  if (input.province !== undefined) cols.province = input.province;
  if (input.district !== undefined) cols.district = input.district;
  if (input.sector !== undefined) cols.sector = input.sector;
  if (input.cell !== undefined) cols.cell = input.cell;
  if (input.village !== undefined) cols.villageOrArea = input.village;
  if (input.additionalLocation !== undefined) cols.additionalLocation = input.additionalLocation;
  if (input.amenities !== undefined) cols.amenities = input.amenities;
  return cols;
}

export async function createProperty(db: Database, landlordId: string, input: CreatePropertyInput) {
  // landlordId comes from the session; new properties start unpublished.
  const property = await propertyRepo.createProperty(db, {
    landlordId,
    ...createColumns(input),
  });
  return propertyRepo.toManagementProperty(property);
}

export async function listMine(db: Database, landlordId: string) {
  const rows = await propertyRepo.listByLandlord(db, landlordId);
  return rows.map(propertyRepo.toManagementProperty);
}

async function requireOwned(db: Database, landlordId: string, id: string): Promise<Property> {
  const property = await propertyRepo.findByIdForLandlord(db, id, landlordId);
  if (!property) {
    // Generic 404 — never reveal that the property exists under another owner.
    throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
  }
  return property;
}

export async function getMine(db: Database, landlordId: string, id: string) {
  return propertyRepo.toManagementProperty(await requireOwned(db, landlordId, id));
}

export async function updateMine(
  db: Database,
  landlordId: string,
  id: string,
  input: UpdatePropertyInput,
) {
  await requireOwned(db, landlordId, id);
  const updated = await propertyRepo.updateForLandlord(db, id, landlordId, updateColumns(input));
  if (!updated) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
  return propertyRepo.toManagementProperty(updated);
}

export async function deleteMine(db: Database, landlordId: string, id: string): Promise<void> {
  await requireOwned(db, landlordId, id);
  try {
    await propertyRepo.deleteForLandlord(db, id, landlordId);
  } catch (err) {
    // Protected by ON DELETE RESTRICT (e.g. rental/payment history exists).
    const message = err instanceof Error ? err.message : '';
    if (/FOREIGN KEY constraint/i.test(message)) {
      throw ApiError.conflict(
        'This property cannot be deleted because it has related records',
        'PROPERTY_CANNOT_BE_DELETED',
      );
    }
    throw err;
  }
}

/** A property must carry complete listing info before it can go public. */
function assertPublishable(p: Property): void {
  const complete =
    p.title.trim().length > 0 &&
    !!p.propertyType &&
    p.province.trim().length > 0 &&
    p.district.trim().length > 0 &&
    p.sector.trim().length > 0 &&
    typeof p.monthlyRent === 'number' &&
    !!p.description &&
    p.description.trim().length > 0;
  if (!complete) {
    throw ApiError.badRequest(
      'Property is missing required listing information (a description is required to publish)',
      'PROPERTY_INCOMPLETE',
    );
  }
}

export async function publishMine(db: Database, landlordId: string, id: string) {
  const property = await requireOwned(db, landlordId, id);
  assertPublishable(property);
  const updated = await propertyRepo.setPublishedForLandlord(
    db,
    id,
    landlordId,
    true,
    property.publishedAt ?? new Date(),
  );
  if (!updated) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
  return propertyRepo.toManagementProperty(updated);
}

export async function unpublishMine(db: Database, landlordId: string, id: string) {
  await requireOwned(db, landlordId, id);
  const updated = await propertyRepo.setPublishedForLandlord(db, id, landlordId, false, null);
  if (!updated) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
  return propertyRepo.toManagementProperty(updated);
}

/** Public detail: only published properties are visible; unpublished → 404. */
export async function getPublic(db: Database, id: string) {
  const property = await propertyRepo.findPublishedById(db, id);
  if (!property) {
    throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
  }
  const landlord = await userRepo.findUserById(db, property.landlordId);
  const safeLandlord = landlord
    ? { id: landlord.id, firstName: landlord.firstName, lastName: landlord.lastName }
    : { id: property.landlordId, firstName: '', lastName: '' };
  const images = await imageService.listPublicImages(db, property.id);
  return propertyRepo.toPublicProperty(property, safeLandlord, images);
}

/**
 * Public discovery (B17): published-only, filtered, paginated property list.
 * Enforces `is_published = true` in the repository (never inferred from status
 * or the client). Landlords and primary images are BATCH-hydrated to avoid N+1.
 * Returns listing-safe cards (no landlord contact, no storage keys) + pagination.
 */
export async function listPublishedProperties(db: Database, query: ListPublicPropertiesQuery) {
  const { page, limit, sort } = query;
  const { rows, total } = await propertyRepo.findPublishedProperties(
    db,
    {
      province: query.province,
      district: query.district,
      sector: query.sector,
      cell: query.cell,
      villageOrArea: query.villageOrArea,
      propertyType: query.propertyType,
      status: query.status,
      minRent: query.minRent,
      maxRent: query.maxRent,
      bedrooms: query.bedrooms,
      bathrooms: query.bathrooms,
      q: query.q,
      sort,
    },
    page,
    limit,
  );

  // Batch-hydrate landlord display names (no N+1).
  const landlordIds = [...new Set(rows.map((r) => r.landlordId))];
  const landlords = await userRepo.findManyByIds(db, landlordIds);
  const landlordMap = new Map(
    landlords.map((u) => [u.id, { id: u.id, firstName: u.firstName, lastName: u.lastName }]),
  );

  // Batch-hydrate the primary image per property (no N+1). Ordered so the first
  // row per property id is the primary (then lowest sortOrder).
  const images = await imageRepo.listByPropertyIds(
    db,
    rows.map((r) => r.id),
  );
  const primaryByProperty = new Map<string, (typeof images)[number]>();
  for (const img of images) {
    if (!primaryByProperty.has(img.propertyId)) primaryByProperty.set(img.propertyId, img);
  }

  const properties = rows.map((p) => {
    const landlord = landlordMap.get(p.landlordId) ?? {
      id: p.landlordId,
      firstName: '',
      lastName: '',
    };
    const primary = primaryByProperty.get(p.id);
    const imgs = primary ? [imageService.toPublicImage(primary)] : [];
    return propertyRepo.toPublicPropertyCard(p, landlord, imgs);
  });

  return {
    properties,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
