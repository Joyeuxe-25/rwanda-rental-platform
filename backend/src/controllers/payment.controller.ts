import type { Context } from 'hono';

import { getDb } from '../db/client';
import { getAuthUser } from '../middleware/auth';
import * as service from '../services/payment.service';
import { ensureMtnRegistered, resolveMtnProvider } from '../services/payment-providers/mtn-momo';
import type { AppEnv } from '../types';
import type { PaymentProvider } from '../types/payment';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import { idempotencyKeySchema } from '../validators/payment.validators';
import type { CreatePaymentInput } from '../validators/payment.validators';

/** Resolve the payment provider (if any) configured for the requested provider. */
function resolveProvider(c: Context<AppEnv>, provider: string): PaymentProvider | null {
  if (provider === 'MTN_MOMO') return resolveMtnProvider(c.env);
  return null; // AIRTEL_MONEY → B11
}

/**
 * Payment controllers (B8). Thin HTTP layer: tenant/landlord identity from the
 * session; ids from route params; the idempotency key from the `Idempotency-Key`
 * header (never the body). Business rules live in the service.
 */
function param(c: Context<AppEnv>, name: string): string {
  const v = c.req.param(name);
  if (!v) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  return v;
}

/** POST /api/v1/payments (TENANT) — create a PENDING payment intent. */
export async function create(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);

  const rawKey = c.req.header('Idempotency-Key');
  const parsedKey = idempotencyKeySchema.safeParse(rawKey);
  if (!parsedKey.success) {
    throw new ApiError(
      400,
      'A valid Idempotency-Key header (8-255 chars) is required',
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }

  const input = c.get('validatedBody') as CreatePaymentInput;

  // Register the MTN webhook adapter (if configured) and resolve the provider
  // used to initiate this charge. No provider configured → provider-independent
  // B8 behavior (a plain PENDING intent, no external call).
  ensureMtnRegistered(c.env);
  const provider = resolveProvider(c, input.provider);

  const { payment, created } = await service.createPayment(
    getDb(c.env),
    tenantId,
    parsedKey.data,
    input,
    { provider },
  );
  // 201 for a new intent; 200 for an idempotent replay of an existing one.
  return sendSuccess(c, { payment }, created ? 201 : 200);
}

/** GET /api/v1/payments/mine (TENANT) */
export async function listMine(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const payments = await service.listMine(getDb(c.env), tenantId);
  return sendSuccess(c, { payments });
}

/** GET /api/v1/payments/mine/:id (TENANT) */
export async function getMine(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const payment = await service.getMine(getDb(c.env), tenantId, param(c, 'id'));
  return sendSuccess(c, { payment });
}

/** GET /api/v1/payments/landlord (LANDLORD) */
export async function listLandlord(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const payments = await service.listForLandlord(getDb(c.env), landlordId);
  return sendSuccess(c, { payments });
}

/** GET /api/v1/payments/landlord/:id (LANDLORD) */
export async function getLandlord(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const payment = await service.getForLandlord(getDb(c.env), landlordId, param(c, 'id'));
  return sendSuccess(c, { payment });
}
