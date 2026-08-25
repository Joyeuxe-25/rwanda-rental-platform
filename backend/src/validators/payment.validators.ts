import { z } from 'zod';

/**
 * Payment validators (B8). Strict schema — the ONLY client-provided fields are
 * `rentalId`, `amount`, `paymentPeriod`, `provider`. Everything else
 * (tenantId/landlordId/propertyId/status/providerTransactionId/currency/id/
 * completedAt/timestamps) is server-controlled and rejected (422). The
 * idempotency key comes from the `Idempotency-Key` HEADER, not the body.
 *
 * Money is an INTEGER whole RWF (no floats). Payment period is canonical
 * `YYYY-MM`.
 */
export const createPaymentSchema = z
  .object({
    rentalId: z.string().min(1, 'rentalId is required'),
    amount: z
      .number()
      .int('Amount must be a whole number of RWF')
      .positive('Amount must be greater than zero')
      .max(1_000_000_000),
    paymentPeriod: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'paymentPeriod must be in YYYY-MM format'),
    provider: z.enum(['MTN_MOMO', 'AIRTEL_MONEY']),
  })
  .strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** Idempotency-Key header value constraints. */
export const idempotencyKeySchema = z.string().trim().min(8).max(255);
