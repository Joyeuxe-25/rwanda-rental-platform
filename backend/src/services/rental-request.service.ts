import type { Database } from '../db/client';
import type { Property, RentalRequest, User } from '../db/schema';
import * as propertyRepo from '../repositories/property.repository';
import * as requestRepo from '../repositories/rental-request.repository';
import * as notify from './notification.service';
import { logger } from '../lib/logger';
import { ApiError } from '../utils/ApiError';
import type { CreateRentalRequestInput } from '../validators/rental-request.validators';

/**
 * Rental-request service (B6). Owns all business/authorization decisions:
 * tenant identity comes from the session, landlord ownership is derived via
 * property.landlord_id, and state transitions are atomic conditional updates.
 *
 * B6 does NOT create rentals, payments, or notifications, and never changes
 * property.status — approval only sets the request status to ACCEPTED.
 */

/** Compact, safe property summary embedded in request responses. */
function propertySummary(p: Property) {
  return {
    id: p.id,
    title: p.title,
    propertyType: p.propertyType,
    monthlyRent: p.monthlyRent,
    currency: p.currency,
    district: p.district,
    sector: p.sector,
    status: p.status,
    isPublished: p.isPublished,
  };
}

/** Tenant-facing request representation (with property summary). */
function toTenantView(request: RentalRequest, property?: Property) {
  return {
    id: request.id,
    propertyId: request.propertyId,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    ...(property ? { property: propertySummary(property) } : {}),
  };
}

/** Landlord-facing request representation (with safe tenant identity). */
function toLandlordView(request: RentalRequest, property: Property, tenant: User) {
  return {
    id: request.id,
    propertyId: request.propertyId,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    property: propertySummary(property),
    tenant: { id: tenant.id, firstName: tenant.firstName, lastName: tenant.lastName },
  };
}

// --- Tenant flows ------------------------------------------------------------

export async function createRequest(
  db: Database,
  tenantId: string,
  input: CreateRentalRequestInput,
) {
  const property = await propertyRepo.findById(db, input.propertyId);
  if (!property) {
    throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
  }
  if (!property.isPublished) {
    throw ApiError.conflict('Property is not published', 'PROPERTY_NOT_PUBLISHED');
  }
  if (property.status !== 'AVAILABLE') {
    throw ApiError.conflict('Property is not available for rent', 'PROPERTY_NOT_AVAILABLE');
  }

  // One active (PENDING/ACCEPTED) request per tenant+property.
  const active = await requestRepo.findActiveByTenantAndProperty(db, tenantId, input.propertyId);
  if (active) {
    throw ApiError.conflict(
      'You already have an active request for this property',
      'RENTAL_REQUEST_ALREADY_EXISTS',
    );
  }

  let request: RentalRequest;
  try {
    request = await requestRepo.insertRequest(db, {
      tenantId,
      propertyId: input.propertyId,
      message: input.message ?? null,
    });
  } catch (err) {
    // Race: partial unique index (rental_requests_active_unique) violated.
    const message = err instanceof Error ? err.message : '';
    if (/UNIQUE constraint/i.test(message)) {
      throw ApiError.conflict(
        'You already have an active request for this property',
        'RENTAL_REQUEST_ALREADY_EXISTS',
      );
    }
    throw err;
  }

  logger.info('rental_request.created', { tenantId, requestId: request.id });
  // Notifications are a secondary, failure-isolated side-effect (never blocks).
  await notify.notifyRentalRequestSubmitted(db, {
    requestId: request.id,
    propertyTitle: property.title,
    tenantId,
    landlordId: property.landlordId,
  });
  return toTenantView(request, property);
}

export async function listMine(db: Database, tenantId: string) {
  const rows = await requestRepo.listByTenant(db, tenantId);
  return rows.map((r) => toTenantView(r.request, r.property));
}

export async function getMine(db: Database, tenantId: string, id: string) {
  const row = await requestRepo.findByIdForTenant(db, id, tenantId);
  if (!row) throw ApiError.notFound('Rental request not found', 'RENTAL_REQUEST_NOT_FOUND');
  return toTenantView(row.request, row.property);
}

export async function cancelMine(db: Database, tenantId: string, id: string) {
  const row = await requestRepo.findByIdForTenant(db, id, tenantId);
  if (!row) throw ApiError.notFound('Rental request not found', 'RENTAL_REQUEST_NOT_FOUND');
  if (row.request.status !== 'PENDING') {
    throw ApiError.conflict(
      'Only a pending request can be cancelled',
      'RENTAL_REQUEST_CANNOT_BE_CANCELLED',
    );
  }
  const updated = await requestRepo.cancelIfPending(db, id, tenantId);
  if (!updated) {
    // Lost the race — it was processed between the read and the update.
    throw ApiError.conflict(
      'Only a pending request can be cancelled',
      'RENTAL_REQUEST_CANNOT_BE_CANCELLED',
    );
  }
  logger.info('rental_request.cancelled', { tenantId, requestId: id });
  await notify.notifyRentalRequestCancelled(db, {
    requestId: id,
    propertyTitle: row.property.title,
    landlordId: row.property.landlordId,
  });
  return toTenantView(updated, row.property);
}

// --- Landlord flows ----------------------------------------------------------

export async function listForLandlord(db: Database, landlordId: string) {
  const rows = await requestRepo.listForLandlord(db, landlordId);
  return rows.map((r) => toLandlordView(r.request, r.property, r.tenant));
}

export async function getForLandlord(db: Database, landlordId: string, id: string) {
  const row = await requestRepo.findByIdForLandlord(db, id, landlordId);
  if (!row) throw ApiError.notFound('Rental request not found', 'RENTAL_REQUEST_NOT_FOUND');
  return toLandlordView(row.request, row.property, row.tenant);
}

export async function approve(db: Database, landlordId: string, id: string) {
  const row = await requestRepo.findByIdForLandlord(db, id, landlordId);
  if (!row) throw ApiError.notFound('Rental request not found', 'RENTAL_REQUEST_NOT_FOUND');

  if (row.request.status !== 'PENDING') {
    throw ApiError.conflict(
      'This request has already been processed',
      'RENTAL_REQUEST_ALREADY_PROCESSED',
    );
  }
  // The property must still be publicly listed and available to approve.
  if (!row.property.isPublished) {
    throw ApiError.conflict('Property is not published', 'PROPERTY_NOT_PUBLISHED');
  }
  if (row.property.status !== 'AVAILABLE') {
    throw ApiError.conflict('Property is no longer available', 'PROPERTY_NOT_AVAILABLE');
  }

  // Atomic transition: only succeeds if still PENDING.
  const updated = await requestRepo.transitionIfPending(db, id, 'ACCEPTED');
  if (!updated) {
    throw ApiError.conflict(
      'This request has already been processed',
      'RENTAL_REQUEST_ALREADY_PROCESSED',
    );
  }
  logger.info('rental_request.approved', { landlordId, requestId: id });
  await notify.notifyRentalRequestAccepted(db, {
    requestId: id,
    propertyTitle: row.property.title,
    tenantId: row.request.tenantId,
  });
  return toLandlordView(updated, row.property, row.tenant);
}

export async function reject(db: Database, landlordId: string, id: string) {
  const row = await requestRepo.findByIdForLandlord(db, id, landlordId);
  if (!row) throw ApiError.notFound('Rental request not found', 'RENTAL_REQUEST_NOT_FOUND');
  if (row.request.status !== 'PENDING') {
    throw ApiError.conflict(
      'This request has already been processed',
      'RENTAL_REQUEST_ALREADY_PROCESSED',
    );
  }
  const updated = await requestRepo.transitionIfPending(db, id, 'REJECTED');
  if (!updated) {
    throw ApiError.conflict(
      'This request has already been processed',
      'RENTAL_REQUEST_ALREADY_PROCESSED',
    );
  }
  logger.info('rental_request.rejected', { landlordId, requestId: id });
  await notify.notifyRentalRequestRejected(db, {
    requestId: id,
    propertyTitle: row.property.title,
    tenantId: row.request.tenantId,
  });
  return toLandlordView(updated, row.property, row.tenant);
}
