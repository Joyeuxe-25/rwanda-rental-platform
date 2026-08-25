import { and, desc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../db/client';
import {
  properties,
  rentalRequests,
  users,
  type NewRentalRequest,
  type Property,
  type RentalRequest,
  type User,
} from '../db/schema';

/**
 * Rental-request data-access (B6). Ownership is enforced in the query
 * (tenant-scoped by `tenant_id`; landlord-scoped by the landlord's property
 * ids). Status transitions use conditional UPDATE ... WHERE status = 'PENDING'
 * RETURNING, so they are atomic and cannot double-transition under races.
 *
 * NOTE: related rows (property, tenant) are fetched with separate scoped queries
 * rather than SQL joins — joins that select two full tables share column names
 * (id/status/created_at/...), which some SQLite result readers collapse.
 * Separate lookups keep results unambiguous and portable.
 */

export interface RequestWithProperty {
  request: RentalRequest;
  property: Property;
}
export interface RequestWithPropertyAndTenant extends RequestWithProperty {
  tenant: User;
}

export async function insertRequest(
  db: Database,
  values: Pick<NewRentalRequest, 'tenantId' | 'propertyId' | 'message'>,
): Promise<RentalRequest> {
  const [row] = await db.insert(rentalRequests).values(values).returning();
  return row!;
}

/** An "active" (PENDING or ACCEPTED) request for this tenant+property, if any. */
export async function findActiveByTenantAndProperty(
  db: Database,
  tenantId: string,
  propertyId: string,
): Promise<RentalRequest | undefined> {
  return db
    .select()
    .from(rentalRequests)
    .where(
      and(
        eq(rentalRequests.tenantId, tenantId),
        eq(rentalRequests.propertyId, propertyId),
        inArray(rentalRequests.status, ['PENDING', 'ACCEPTED']),
      ),
    )
    .get();
}

async function propertyById(db: Database, id: string): Promise<Property | undefined> {
  return db.select().from(properties).where(eq(properties.id, id)).get();
}

async function propertiesByIds(db: Database, ids: string[]): Promise<Map<string, Property>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(properties).where(inArray(properties.id, ids)).all();
  return new Map(rows.map((p) => [p.id, p]));
}

async function usersByIds(db: Database, ids: string[]): Promise<Map<string, User>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, ids)).all();
  return new Map(rows.map((u) => [u.id, u]));
}

// --- Tenant-scoped -----------------------------------------------------------

export async function listByTenant(db: Database, tenantId: string): Promise<RequestWithProperty[]> {
  const requests = await db
    .select()
    .from(rentalRequests)
    .where(eq(rentalRequests.tenantId, tenantId))
    .orderBy(desc(rentalRequests.createdAt))
    .all();
  const propMap = await propertiesByIds(db, [...new Set(requests.map((r) => r.propertyId))]);
  return requests.map((request) => ({ request, property: propMap.get(request.propertyId)! }));
}

export async function findByIdForTenant(
  db: Database,
  id: string,
  tenantId: string,
): Promise<RequestWithProperty | undefined> {
  const request = await db
    .select()
    .from(rentalRequests)
    .where(and(eq(rentalRequests.id, id), eq(rentalRequests.tenantId, tenantId)))
    .get();
  if (!request) return undefined;
  const property = await propertyById(db, request.propertyId);
  if (!property) return undefined;
  return { request, property };
}

/** Cancel: PENDING → CANCELLED, scoped to owner. Returns the row iff it changed. */
export async function cancelIfPending(
  db: Database,
  id: string,
  tenantId: string,
): Promise<RentalRequest | undefined> {
  const [row] = await db
    .update(rentalRequests)
    .set({ status: 'CANCELLED' })
    .where(
      and(
        eq(rentalRequests.id, id),
        eq(rentalRequests.tenantId, tenantId),
        eq(rentalRequests.status, 'PENDING'),
      ),
    )
    .returning();
  return row;
}

// --- Landlord-scoped ---------------------------------------------------------

export async function listForLandlord(
  db: Database,
  landlordId: string,
): Promise<RequestWithPropertyAndTenant[]> {
  const ownedProps = await db
    .select()
    .from(properties)
    .where(eq(properties.landlordId, landlordId))
    .all();
  if (ownedProps.length === 0) return [];
  const propMap = new Map(ownedProps.map((p) => [p.id, p]));

  const requests = await db
    .select()
    .from(rentalRequests)
    .where(inArray(rentalRequests.propertyId, [...propMap.keys()]))
    .orderBy(desc(rentalRequests.createdAt))
    .all();

  const tenantMap = await usersByIds(db, [...new Set(requests.map((r) => r.tenantId))]);
  return requests.map((request) => ({
    request,
    property: propMap.get(request.propertyId)!,
    tenant: tenantMap.get(request.tenantId)!,
  }));
}

export async function findByIdForLandlord(
  db: Database,
  id: string,
  landlordId: string,
): Promise<RequestWithPropertyAndTenant | undefined> {
  const request = await db.select().from(rentalRequests).where(eq(rentalRequests.id, id)).get();
  if (!request) return undefined;
  const property = await propertyById(db, request.propertyId);
  // Ownership check: the request's property must belong to this landlord.
  if (!property || property.landlordId !== landlordId) return undefined;
  const tenant = await db.select().from(users).where(eq(users.id, request.tenantId)).get();
  if (!tenant) return undefined;
  return { request, property, tenant };
}

/** Approve/Reject: PENDING → ACCEPTED|REJECTED (atomic). Returns row iff changed. */
export async function transitionIfPending(
  db: Database,
  id: string,
  status: 'ACCEPTED' | 'REJECTED',
): Promise<RentalRequest | undefined> {
  const [row] = await db
    .update(rentalRequests)
    .set({ status })
    .where(and(eq(rentalRequests.id, id), eq(rentalRequests.status, 'PENDING')))
    .returning();
  return row;
}
