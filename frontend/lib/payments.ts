import { api } from '@/lib/api';
import type { CreatePaymentInput, LandlordPayment, TenantPayment } from '@/types/payment';

/**
 * Payment data access (F6). Reuses the F0 API client (cookie-credentialed,
 * envelope-aware) — NO second HTTP client, NO JWT/Bearer, NO token storage, and
 * NO direct provider (MTN/Airtel) calls. Every call is authenticated purely by
 * the HttpOnly `rrp_session` cookie (`credentials: 'include'`). Payment data is
 * private and user-specific, so reads use `no-store` — never publicly cached.
 *
 * Integrates the approved B8/B10 endpoints under `/api/v1/payments`.
 */

/**
 * POST /payments → the created (or idempotently-replayed) payment. The idempotency
 * key travels in the `Idempotency-Key` HEADER (never the body); the body carries
 * only `{ rentalId, amount, paymentPeriod, provider }`. The result is a PENDING
 * intent — success only ever comes later from the backend/provider, never here.
 */
export async function createPayment(
  input: CreatePaymentInput,
  idempotencyKey: string,
): Promise<TenantPayment> {
  const data = await api.post<{ payment: TenantPayment }>('/payments', input, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data.payment;
}

/** GET /payments/mine → the tenant's own payments. */
export async function listMyPayments(): Promise<TenantPayment[]> {
  const data = await api.get<{ payments: TenantPayment[] }>('/payments/mine', {
    cache: 'no-store',
  });
  return data.payments;
}

/** GET /payments/mine/:id → one of the tenant's own payments. */
export async function getMyPayment(id: string): Promise<TenantPayment> {
  const data = await api.get<{ payment: TenantPayment }>(
    `/payments/mine/${encodeURIComponent(id)}`,
    { cache: 'no-store' },
  );
  return data.payment;
}

/** GET /payments/landlord → payments for the landlord's own properties. */
export async function listLandlordPayments(): Promise<LandlordPayment[]> {
  const data = await api.get<{ payments: LandlordPayment[] }>('/payments/landlord', {
    cache: 'no-store',
  });
  return data.payments;
}

/** GET /payments/landlord/:id → one payment for a landlord's property. */
export async function getLandlordPayment(id: string): Promise<LandlordPayment> {
  const data = await api.get<{ payment: LandlordPayment }>(
    `/payments/landlord/${encodeURIComponent(id)}`,
    { cache: 'no-store' },
  );
  return data.payment;
}
