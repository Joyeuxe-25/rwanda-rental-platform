import { and, desc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../db/client';
import {
  properties,
  rentals,
  users,
  type NewRental,
  type Property,
  type Rental,
  type User,
} from '../db/schema';

/**
 * Rental data-access (B7). Scoping is enforced in the query — `rentals` carries
 * `tenant_id` and `landlord_id`, so tenant/landlord lists filter directly (no
 * joins). Related property/user rows are fetched with separate scoped queries
 * and joined in memory (see the B6 note: the node:sqlite test reader collapses
 * duplicate column names from multi-table joins).
 *
 * ATOMICITY: the rental write and its coupled property-status change are issued
 * as a single D1 `batch()` — D1's native transactional primitive (all-or-
 * nothing). This is NOT an interactive transaction and is NOT faked: if either
 * statement fails, D1 rolls back the whole batch, so a rental can never persist
 * without its property change (and vice-versa).
 *
 * Lifecycle transitions also use conditional `WHERE status = 'ACTIVE'`, so they
 * are atomic and cannot double-transition.
 */

export interface RentalWithParties {
  rental: Rental;
  property: Property;
  landlord: User;
  tenant: User;
}

/**
 * Atomically create the rental AND mark its property OCCUPIED in one D1 batch.
 * Both unique constraints (rental_request_id, one-active-per-property) are
 * enforced by the insert; if anything fails, nothing persists.
 */
export async function createRentalOccupyingProperty(
  db: Database,
  values: NewRental,
  propertyId: string,
): Promise<Rental> {
  const [inserted] = await db.batch([
    db.insert(rentals).values(values).returning(),
    db.update(properties).set({ status: 'OCCUPIED' }).where(eq(properties.id, propertyId)),
  ]);
  return inserted[0]!;
}

/** The rental created from a given request, if any (the "converted" marker). */
export async function findByRentalRequestId(
  db: Database,
  rentalRequestId: string,
): Promise<Rental | undefined> {
  return db.select().from(rentals).where(eq(rentals.rentalRequestId, rentalRequestId)).get();
}

async function propsByIds(db: Database, ids: string[]): Promise<Map<string, Property>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(properties).where(inArray(properties.id, ids)).all();
  return new Map(rows.map((p) => [p.id, p]));
}
async function usersByIds(db: Database, ids: string[]): Promise<Map<string, User>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, ids)).all();
  return new Map(rows.map((u) => [u.id, u]));
}

async function hydrate(db: Database, list: Rental[]): Promise<RentalWithParties[]> {
  const propMap = await propsByIds(db, [...new Set(list.map((r) => r.propertyId))]);
  const userMap = await usersByIds(db, [
    ...new Set(list.flatMap((r) => [r.tenantId, r.landlordId])),
  ]);
  return list.map((rental) => ({
    rental,
    property: propMap.get(rental.propertyId)!,
    landlord: userMap.get(rental.landlordId)!,
    tenant: userMap.get(rental.tenantId)!,
  }));
}

// --- Tenant-scoped -----------------------------------------------------------

export async function listByTenant(db: Database, tenantId: string): Promise<RentalWithParties[]> {
  const list = await db
    .select()
    .from(rentals)
    .where(eq(rentals.tenantId, tenantId))
    .orderBy(desc(rentals.createdAt))
    .all();
  return hydrate(db, list);
}

export async function findByIdForTenant(
  db: Database,
  id: string,
  tenantId: string,
): Promise<RentalWithParties | undefined> {
  const rental = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, id), eq(rentals.tenantId, tenantId)))
    .get();
  if (!rental) return undefined;
  return (await hydrate(db, [rental]))[0];
}

// --- Landlord-scoped ---------------------------------------------------------

export async function listByLandlord(
  db: Database,
  landlordId: string,
): Promise<RentalWithParties[]> {
  const list = await db
    .select()
    .from(rentals)
    .where(eq(rentals.landlordId, landlordId))
    .orderBy(desc(rentals.createdAt))
    .all();
  return hydrate(db, list);
}

export async function findByIdForLandlord(
  db: Database,
  id: string,
  landlordId: string,
): Promise<RentalWithParties | undefined> {
  const rental = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, id), eq(rentals.landlordId, landlordId)))
    .get();
  if (!rental) return undefined;
  return (await hydrate(db, [rental]))[0];
}

/**
 * Lifecycle transition ACTIVE → COMPLETED|TERMINATED, scoped to the landlord,
 * AND free the property (OCCUPIED → AVAILABLE) — atomically in one D1 batch.
 *
 * The rental update is conditional on `status = 'ACTIVE'` (returns the row iff
 * it transitioned); the property is freed only if it was OCCUPIED. Either both
 * changes apply or neither does, so a rental can never be terminal while its
 * property stays OCCUPIED (or vice-versa).
 */
export async function endRentalFreeingProperty(
  db: Database,
  id: string,
  landlordId: string,
  status: 'COMPLETED' | 'TERMINATED',
  endDate: Date,
  propertyId: string,
): Promise<Rental | undefined> {
  const [updated] = await db.batch([
    db
      .update(rentals)
      .set({ status, endDate })
      .where(
        and(eq(rentals.id, id), eq(rentals.landlordId, landlordId), eq(rentals.status, 'ACTIVE')),
      )
      .returning(),
    db
      .update(properties)
      .set({ status: 'AVAILABLE' })
      .where(and(eq(properties.id, propertyId), eq(properties.status, 'OCCUPIED'))),
  ]);
  return updated[0];
}
