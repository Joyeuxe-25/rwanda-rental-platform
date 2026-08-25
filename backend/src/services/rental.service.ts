import type { Database } from '../db/client';
import type { Property, Rental, User } from '../db/schema';
import { logger } from '../lib/logger';
import * as requestRepo from '../repositories/rental-request.repository';
import * as rentalRepo from '../repositories/rental.repository';
import type { RentalWithParties } from '../repositories/rental.repository';
import * as notify from './notification.service';
import { ApiError } from '../utils/ApiError';
import type { CreateRentalInput } from '../validators/rental.validators';

/**
 * Rental service (B7). Converts an ACCEPTED rental request into exactly one
 * ACTIVE rental and manages the ACTIVE → COMPLETED | TERMINATED lifecycle.
 *
 * Identity is always server-derived (tenant/property from the request, landlord
 * from the property). Money/status are never client-provided. There is no
 * interactive D1 transaction; consistency is guaranteed by DB constraints:
 *   - rentals.rental_request_id UNIQUE  → one rental per request
 *   - partial unique index on (property_id) WHERE status='ACTIVE' → one active
 *     rental per property
 * The rental row is the source of truth; property.status is updated after a
 * successful insert, so a failed insert never leaves a property OCCUPIED.
 */

function propertySummary(p: Property) {
  return {
    id: p.id,
    title: p.title,
    propertyType: p.propertyType,
    district: p.district,
    sector: p.sector,
    status: p.status,
  };
}
function person(u: User) {
  return { id: u.id, firstName: u.firstName, lastName: u.lastName };
}
function rentalBase(r: Rental) {
  return {
    id: r.id,
    propertyId: r.propertyId,
    rentalRequestId: r.rentalRequestId,
    status: r.status,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate ? r.endDate.toISOString() : null,
    monthlyRent: r.monthlyRent,
    securityDeposit: r.securityDeposit,
    currency: r.currency,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
/** Tenant sees the landlord's display identity. */
function toTenantView(x: RentalWithParties) {
  return {
    ...rentalBase(x.rental),
    property: propertySummary(x.property),
    landlord: person(x.landlord),
  };
}
/** Landlord sees the tenant's display identity. */
function toLandlordView(x: RentalWithParties) {
  return {
    ...rentalBase(x.rental),
    property: propertySummary(x.property),
    tenant: person(x.tenant),
  };
}

// --- Creation ----------------------------------------------------------------

export async function createFromRequest(
  db: Database,
  tenantId: string,
  rentalRequestId: string,
  input: CreateRentalInput,
) {
  // Load the request scoped to the authenticated tenant (no cross-tenant leak).
  const found = await requestRepo.findByIdForTenant(db, rentalRequestId, tenantId);
  if (!found) {
    throw ApiError.notFound('Rental request not found', 'RENTAL_REQUEST_NOT_FOUND');
  }
  const { request, property } = found;

  if (request.status !== 'ACCEPTED') {
    throw ApiError.conflict(
      'Only an accepted rental request can be converted into a rental',
      'RENTAL_REQUEST_NOT_ACCEPTED',
    );
  }

  // Already converted? (fast path; the UNIQUE index is the race-safe backstop)
  const existing = await rentalRepo.findByRentalRequestId(db, request.id);
  if (existing) {
    throw ApiError.conflict('A rental already exists for this request', 'RENTAL_ALREADY_EXISTS');
  }

  if (!property.isPublished) {
    throw ApiError.conflict('Property is not published', 'PROPERTY_NOT_PUBLISHED');
  }
  if (property.status !== 'AVAILABLE') {
    throw ApiError.conflict('Property is not available', 'PROPERTY_NOT_AVAILABLE');
  }

  const startDate = input.startDate ?? new Date();
  const endDate = input.endDate ?? null;

  let rental: Rental;
  try {
    // Atomic: create the ACTIVE rental AND mark the property OCCUPIED in one D1
    // batch. If either statement fails, the whole batch rolls back — so there is
    // never a dangling ACTIVE rental with an AVAILABLE property (or vice-versa).
    rental = await rentalRepo.createRentalOccupyingProperty(
      db,
      {
        tenantId: request.tenantId, // derived from the request
        propertyId: request.propertyId, // derived from the request
        landlordId: property.landlordId, // derived from the property owner
        rentalRequestId: request.id,
        status: 'ACTIVE',
        startDate,
        endDate,
        monthlyRent: property.monthlyRent, // snapshot, server-derived
        securityDeposit: property.securityDeposit,
        currency: property.currency,
      },
      property.id,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    // Same request already produced a rental (rental_request_id UNIQUE).
    if (/rental_request_id/i.test(message)) {
      throw ApiError.conflict('A rental already exists for this request', 'RENTAL_ALREADY_EXISTS');
    }
    // Property already has an ACTIVE rental (partial unique index).
    if (/one_active_per_property|property_id/i.test(message)) {
      throw ApiError.conflict('Property is not available', 'PROPERTY_NOT_AVAILABLE');
    }
    throw err;
  }

  logger.info('rental.created', { tenantId, rentalId: rental.id, propertyId: property.id });

  // Rental is authoritative (created atomically above); notify after commit.
  await notify.notifyRentalActivated(db, {
    rentalId: rental.id,
    propertyTitle: property.title,
    tenantId: rental.tenantId,
    landlordId: rental.landlordId,
  });

  const hydrated = await rentalRepo.findByIdForTenant(db, rental.id, tenantId);
  return toTenantView(hydrated!);
}

// --- Reads -------------------------------------------------------------------

export async function listMine(db: Database, tenantId: string) {
  return (await rentalRepo.listByTenant(db, tenantId)).map(toTenantView);
}
export async function getMine(db: Database, tenantId: string, id: string) {
  const found = await rentalRepo.findByIdForTenant(db, id, tenantId);
  if (!found) throw ApiError.notFound('Rental not found', 'RENTAL_NOT_FOUND');
  return toTenantView(found);
}
export async function listForLandlord(db: Database, landlordId: string) {
  return (await rentalRepo.listByLandlord(db, landlordId)).map(toLandlordView);
}
export async function getForLandlord(db: Database, landlordId: string, id: string) {
  const found = await rentalRepo.findByIdForLandlord(db, id, landlordId);
  if (!found) throw ApiError.notFound('Rental not found', 'RENTAL_NOT_FOUND');
  return toLandlordView(found);
}

// --- Lifecycle (landlord) ----------------------------------------------------

async function endRental(
  db: Database,
  landlordId: string,
  id: string,
  status: 'COMPLETED' | 'TERMINATED',
) {
  const found = await rentalRepo.findByIdForLandlord(db, id, landlordId);
  if (!found) throw ApiError.notFound('Rental not found', 'RENTAL_NOT_FOUND');
  if (found.rental.status !== 'ACTIVE') {
    throw ApiError.conflict('Only an active rental can be changed', 'RENTAL_NOT_ACTIVE');
  }
  // Atomic: end the rental AND free the property in one D1 batch.
  const updated = await rentalRepo.endRentalFreeingProperty(
    db,
    id,
    landlordId,
    status,
    new Date(),
    found.property.id,
  );
  if (!updated) {
    throw ApiError.conflict('Only an active rental can be changed', 'RENTAL_NOT_ACTIVE');
  }
  logger.info('rental.ended', { landlordId, rentalId: id, status });
  await notify.notifyRentalEnded(db, {
    rentalId: id,
    propertyTitle: found.property.title,
    tenantId: found.rental.tenantId,
    landlordId: found.rental.landlordId,
    kind: status,
  });
  const hydrated = await rentalRepo.findByIdForLandlord(db, id, landlordId);
  return toLandlordView(hydrated!);
}

export function completeRental(db: Database, landlordId: string, id: string) {
  return endRental(db, landlordId, id, 'COMPLETED');
}
export function terminateRental(db: Database, landlordId: string, id: string) {
  return endRental(db, landlordId, id, 'TERMINATED');
}
