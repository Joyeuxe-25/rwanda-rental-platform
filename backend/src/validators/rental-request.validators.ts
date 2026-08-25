import { z } from 'zod';

/**
 * Rental-request validators (B6). Strict schema — unknown keys are rejected
 * (422), so server-controlled fields (tenantId, landlordId, status, id,
 * approvedAt, rentalId, timestamps, ...) can never be mass-assigned. Only
 * `propertyId` + optional `message` come from the client; the tenant identity
 * is always taken from the session.
 */
export const createRentalRequestSchema = z
  .object({
    propertyId: z.string().min(1, 'propertyId is required'),
    message: z.string().trim().max(1000).optional(),
  })
  .strict();

export type CreateRentalRequestInput = z.infer<typeof createRentalRequestSchema>;
