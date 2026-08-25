import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { Database } from '../db/client';
import {
  payments,
  properties,
  users,
  type NewPayment,
  type Payment,
  type Property,
  type User,
} from '../db/schema';
import type { PaymentStatus } from '../types/payment';

/**
 * Payment data-access (B8). Scoping is enforced in the query — `payments`
 * carries `tenant_id` and `landlord_id`, so tenant/landlord lookups filter
 * directly (no joins). Related property/counterparty rows are fetched with
 * separate scoped queries and joined in memory (per the B6 join-column note).
 */

export interface PaymentWithContext {
  payment: Payment;
  property: Property;
  tenant: User;
  landlord: User;
}

export async function insertPayment(db: Database, values: NewPayment): Promise<Payment> {
  const [row] = await db.insert(payments).values(values).returning();
  return row!;
}

export async function findById(db: Database, id: string): Promise<Payment | undefined> {
  return db.select().from(payments).where(eq(payments.id, id)).get();
}

/**
 * Store the provider transaction reference on a payment (B10). Set only when it
 * is still absent, so a stable reference is assigned exactly once per payment
 * (retries reuse it → the provider dedupes → no double charge).
 */
export async function setProviderTransactionId(
  db: Database,
  id: string,
  providerTransactionId: string,
): Promise<void> {
  await db
    .update(payments)
    .set({ providerTransactionId })
    .where(and(eq(payments.id, id), isNull(payments.providerTransactionId)))
    .run();
}

/**
 * Correlation lookup for provider webhooks (B9): find the payment for a
 * provider + provider transaction id. Correlation is by explicit identifiers
 * only — never by amount/phone/name.
 */
export async function findByProviderAndTxn(
  db: Database,
  provider: Payment['provider'],
  providerTransactionId: string,
): Promise<Payment | undefined> {
  return db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.provider, provider),
        eq(payments.providerTransactionId, providerTransactionId),
      ),
    )
    .get();
}

/** Idempotency lookup: a tenant's existing payment for a given key. */
export async function findByTenantAndKey(
  db: Database,
  tenantId: string,
  idempotencyKey: string,
): Promise<Payment | undefined> {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.idempotencyKey, idempotencyKey)))
    .get();
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

async function hydrate(db: Database, list: Payment[]): Promise<PaymentWithContext[]> {
  const propMap = await propsByIds(db, [...new Set(list.map((p) => p.propertyId))]);
  const userMap = await usersByIds(db, [
    ...new Set(list.flatMap((p) => [p.tenantId, p.landlordId])),
  ]);
  return list.map((payment) => ({
    payment,
    property: propMap.get(payment.propertyId)!,
    tenant: userMap.get(payment.tenantId)!,
    landlord: userMap.get(payment.landlordId)!,
  }));
}

// --- Tenant-scoped -----------------------------------------------------------

export async function listByTenant(db: Database, tenantId: string): Promise<PaymentWithContext[]> {
  const list = await db
    .select()
    .from(payments)
    .where(eq(payments.tenantId, tenantId))
    .orderBy(desc(payments.createdAt))
    .all();
  return hydrate(db, list);
}

export async function findByIdForTenant(
  db: Database,
  id: string,
  tenantId: string,
): Promise<PaymentWithContext | undefined> {
  const payment = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.tenantId, tenantId)))
    .get();
  if (!payment) return undefined;
  return (await hydrate(db, [payment]))[0];
}

// --- Landlord-scoped ---------------------------------------------------------

export async function listByLandlord(
  db: Database,
  landlordId: string,
): Promise<PaymentWithContext[]> {
  const list = await db
    .select()
    .from(payments)
    .where(eq(payments.landlordId, landlordId))
    .orderBy(desc(payments.createdAt))
    .all();
  return hydrate(db, list);
}

export async function findByIdForLandlord(
  db: Database,
  id: string,
  landlordId: string,
): Promise<PaymentWithContext | undefined> {
  const payment = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.landlordId, landlordId)))
    .get();
  if (!payment) return undefined;
  return (await hydrate(db, [payment]))[0];
}

/**
 * Atomic status transition: only succeeds if the payment is still PENDING.
 * Returns the updated row iff it transitioned. Used by the internal
 * (provider-neutral) status service — never exposed to clients.
 */
export async function transitionIfPending(
  db: Database,
  id: string,
  status: PaymentStatus,
  completedAt: Date | null,
  providerTransactionId: string | null,
): Promise<Payment | undefined> {
  const set: Partial<Payment> = { status, completedAt };
  if (providerTransactionId !== null) set.providerTransactionId = providerTransactionId;
  const [row] = await db
    .update(payments)
    .set(set)
    .where(and(eq(payments.id, id), eq(payments.status, 'PENDING')))
    .returning();
  return row;
}
