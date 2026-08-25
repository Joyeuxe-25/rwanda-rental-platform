import type { Database } from '../db/client';
import type { Payment, Property, User } from '../db/schema';
import { logger } from '../lib/logger';
import * as paymentRepo from '../repositories/payment.repository';
import type { PaymentWithContext } from '../repositories/payment.repository';
import * as rentalRepo from '../repositories/rental.repository';
import * as notify from './notification.service';
import { ApiError } from '../utils/ApiError';
import type { PaymentProvider, PaymentStatus } from '../types/payment';
import type { CreatePaymentInput } from '../validators/payment.validators';

/**
 * Payment service (B8) — provider-INDEPENDENT payment infrastructure.
 *
 * Creates a PENDING payment INTENT for a tenant's own ACTIVE rental. It NEVER
 * moves money and NEVER marks a payment SUCCESSFUL — no provider is called.
 * Identity (tenant/landlord/property/currency) is derived from the rental;
 * money is INTEGER whole RWF. Idempotency is enforced per tenant via the
 * `Idempotency-Key` header + a DB partial-unique index (race-safe).
 *
 * State machine: PENDING → SUCCESSFUL | FAILED | CANCELLED | EXPIRED (terminal).
 * Status transitions are exposed ONLY as an internal service method
 * (`applyProviderStatus`) for future provider integrations/tests — there is no
 * client-facing status-mutation endpoint.
 */

// --- Serializers -------------------------------------------------------------

function propertySummary(p: Property) {
  return {
    id: p.id,
    title: p.title,
    propertyType: p.propertyType,
    district: p.district,
    sector: p.sector,
  };
}
function person(u: User) {
  return { id: u.id, firstName: u.firstName, lastName: u.lastName };
}
function paymentBase(p: Payment) {
  return {
    id: p.id,
    rentalId: p.rentalId,
    propertyId: p.propertyId,
    amount: p.amount,
    currency: p.currency,
    paymentPeriod: p.paymentPeriod,
    provider: p.provider,
    providerTransactionId: p.providerTransactionId,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    updatedAt: p.updatedAt.toISOString(),
  };
}
/** Tenant view — shows the landlord's display identity. Never exposes idempotencyKey. */
export function toTenantView(x: PaymentWithContext) {
  return {
    ...paymentBase(x.payment),
    property: propertySummary(x.property),
    landlord: person(x.landlord),
  };
}
/** Landlord view — shows the tenant's display identity. */
export function toLandlordView(x: PaymentWithContext) {
  return {
    ...paymentBase(x.payment),
    property: propertySummary(x.property),
    tenant: person(x.tenant),
  };
}

// --- Creation ----------------------------------------------------------------

/** Whether two payment intents share the same material parameters (idempotency). */
function sameParams(p: Payment, input: CreatePaymentInput): boolean {
  return (
    p.rentalId === input.rentalId &&
    p.amount === input.amount &&
    p.paymentPeriod === input.paymentPeriod &&
    p.provider === input.provider
  );
}

export interface CreatePaymentResult {
  payment: ReturnType<typeof toTenantView>;
  created: boolean; // false = idempotent replay of an existing payment
}

/** Optional provider integration (B10+). When absent, behaves like B8. */
export interface CreatePaymentOptions {
  provider?: PaymentProvider | null;
}

/**
 * Initiate the charge with the provider (B10). Assigns a STABLE per-payment
 * reference (stored as providerTransactionId) exactly once, so retries reuse it
 * and the provider dedupes — never a double charge. The payment stays PENDING;
 * success only ever comes later via the verified provider callback. Runs for
 * new payments AND idempotent replays of a still-PENDING payment.
 */
async function initiateWithProvider(
  db: Database,
  payment: Payment,
  provider: PaymentProvider,
  payerPhone: string,
): Promise<Payment> {
  let reference = payment.providerTransactionId;
  if (!reference) {
    reference = crypto.randomUUID();
    await paymentRepo.setProviderTransactionId(db, payment.id, reference);
    payment = { ...payment, providerTransactionId: reference };
  }
  // Provider errors surface as safe ApiErrors; the payment remains PENDING with
  // its reference so a retry re-initiates idempotently.
  await provider.initiate({
    amount: payment.amount,
    currency: payment.currency,
    reference,
    payerPhone,
  });
  return payment;
}

export async function createPayment(
  db: Database,
  tenantId: string,
  idempotencyKey: string,
  input: CreatePaymentInput,
  options: CreatePaymentOptions = {},
): Promise<CreatePaymentResult> {
  // 1) Load the rental scoped to the tenant (no cross-tenant leak).
  const rentalCtx = await rentalRepo.findByIdForTenant(db, input.rentalId, tenantId);
  if (!rentalCtx) {
    throw ApiError.notFound('Rental not found', 'RENTAL_NOT_FOUND');
  }
  const { rental, tenant } = rentalCtx;

  // 2) Only ACTIVE rentals accept payments in B8.
  if (rental.status !== 'ACTIVE') {
    throw ApiError.conflict('This rental cannot accept payments', 'RENTAL_NOT_PAYABLE');
  }

  // 3) Amount policy (B8): a positive integer up to the rental's monthly rent.
  //    Partial payments are allowed; overpayment is rejected. Extensible later.
  if (input.amount > rental.monthlyRent) {
    throw new ApiError(
      422,
      'Amount exceeds the monthly rent for this rental',
      'PAYMENT_INVALID_AMOUNT',
    );
  }

  // 4) Resolve the payment: an idempotent replay, or a freshly created intent.
  let payment: Payment;
  let created: boolean;

  const existing = await paymentRepo.findByTenantAndKey(db, tenantId, idempotencyKey);
  if (existing) {
    if (!sameParams(existing, input)) {
      throw ApiError.conflict(
        'Idempotency-Key was already used with different parameters',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    payment = existing;
    created = false;
  } else {
    try {
      payment = await paymentRepo.insertPayment(db, {
        rentalId: rental.id,
        tenantId: rental.tenantId,
        landlordId: rental.landlordId,
        propertyId: rental.propertyId,
        amount: input.amount,
        currency: rental.currency,
        paymentPeriod: input.paymentPeriod,
        provider: input.provider,
        providerTransactionId: null, // assigned at initiation (B10) if any
        status: 'PENDING', // never SUCCESSFUL on creation
        idempotencyKey,
      });
      created = true;
      logger.info('payment.created', {
        tenantId,
        paymentId: payment.id,
        rentalId: rental.id,
        provider: payment.provider,
        status: payment.status,
      });
    } catch (err) {
      // Race: another request with the same (tenant, key) won the unique index.
      const message = err instanceof Error ? err.message : '';
      if (/idempotency/i.test(message) || /UNIQUE constraint/i.test(message)) {
        const raced = await paymentRepo.findByTenantAndKey(db, tenantId, idempotencyKey);
        if (raced) {
          if (!sameParams(raced, input)) {
            throw ApiError.conflict(
              'Idempotency-Key was already used with different parameters',
              'IDEMPOTENCY_KEY_REUSED',
            );
          }
          payment = raced;
          created = false;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  // The PENDING intent is now persisted (authoritative) → notify (idempotent).
  await notify.notifyPaymentInitiated(db, {
    paymentId: payment.id,
    tenantId: payment.tenantId,
    landlordId: payment.landlordId,
    amount: payment.amount,
    currency: payment.currency,
    paymentPeriod: payment.paymentPeriod,
    provider: payment.provider,
  });

  // 5) Provider initiation (B10). Only when a provider is supplied, the payment
  //    is still PENDING, and it matches the requested provider. No provider →
  //    provider-independent B8 behavior (payment stays a plain PENDING intent).
  if (
    options.provider &&
    payment.status === 'PENDING' &&
    payment.provider === options.provider.name
  ) {
    payment = await initiateWithProvider(db, payment, options.provider, tenant.phone);
  }

  const hydrated = await paymentRepo.findByIdForTenant(db, payment.id, tenantId);
  return { payment: toTenantView(hydrated!), created };
}

// --- Reads -------------------------------------------------------------------

export async function listMine(db: Database, tenantId: string) {
  return (await paymentRepo.listByTenant(db, tenantId)).map(toTenantView);
}
export async function getMine(db: Database, tenantId: string, id: string) {
  const found = await paymentRepo.findByIdForTenant(db, id, tenantId);
  if (!found) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  return toTenantView(found);
}
export async function listForLandlord(db: Database, landlordId: string) {
  return (await paymentRepo.listByLandlord(db, landlordId)).map(toLandlordView);
}
export async function getForLandlord(db: Database, landlordId: string, id: string) {
  const found = await paymentRepo.findByIdForLandlord(db, id, landlordId);
  if (!found) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  return toLandlordView(found);
}

// --- Internal status transitions (NOT exposed via HTTP) ----------------------

/**
 * Provider-neutral status update. INTERNAL ONLY — used by future provider
 * integrations (B10/B11) and by tests to simulate a provider result. There is
 * no public endpoint that lets a client set a payment's status.
 *
 * Rules: PENDING → {SUCCESSFUL, FAILED, CANCELLED, EXPIRED}. Terminal states are
 * final; a repeated transition to the SAME terminal status is an idempotent
 * no-op (does not corrupt `completedAt`); any other terminal→X is rejected.
 * `completedAt` is set only for SUCCESSFUL.
 */
export async function applyProviderStatus(
  db: Database,
  paymentId: string,
  target: Exclude<PaymentStatus, 'PENDING'>,
  opts: { providerTransactionId?: string } = {},
): Promise<Payment> {
  const existing = await paymentRepo.findById(db, paymentId);
  if (!existing) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');

  // Idempotent replay of the same terminal status.
  if (existing.status === target) return existing;

  if (existing.status !== 'PENDING') {
    throw ApiError.conflict(
      `Cannot change a ${existing.status} payment`,
      existing.status === 'SUCCESSFUL' ? 'PAYMENT_ALREADY_COMPLETED' : 'PAYMENT_INVALID_STATE',
    );
  }

  const completedAt = target === 'SUCCESSFUL' ? new Date() : null;
  const updated = await paymentRepo.transitionIfPending(
    db,
    paymentId,
    target,
    completedAt,
    opts.providerTransactionId ?? null,
  );
  if (!updated) {
    // Raced out of PENDING between read and write.
    const cur = await paymentRepo.findById(db, paymentId);
    if (cur && cur.status === target) return cur;
    throw ApiError.conflict('Payment is no longer pending', 'PAYMENT_INVALID_STATE');
  }
  logger.info('payment.status_changed', { paymentId, status: target });
  // Notify ONLY on a real PENDING → terminal transition (idempotent replays and
  // terminal conflicts returned/threw earlier, so they never reach here).
  const ctx = {
    paymentId: updated.id,
    tenantId: updated.tenantId,
    landlordId: updated.landlordId,
    amount: updated.amount,
    currency: updated.currency,
    paymentPeriod: updated.paymentPeriod,
    provider: updated.provider,
  };
  if (target === 'SUCCESSFUL') await notify.notifyPaymentSuccessful(db, ctx);
  else if (target === 'FAILED') await notify.notifyPaymentFailed(db, ctx);
  return updated;
}
