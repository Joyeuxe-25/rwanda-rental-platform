import { z } from 'zod';

/**
 * Rental validators (B7). The ONLY client-provided fields on conversion are the
 * optional rental dates; identity (tenant/property/landlord), money, and status
 * are all derived server-side. `.strict()` rejects any other key (tenantId,
 * landlordId, propertyId, monthlyRent, status, id, createdAt, ...) with 422.
 *
 * Dates are ISO-8601 strings coerced to Date; when both are present the start
 * must be strictly before the end.
 */
const createRentalBody = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .strict()
  .refine((v) => !(v.startDate && v.endDate) || v.startDate < v.endDate, {
    message: 'startDate must be before endDate',
    path: ['endDate'],
  });

// A missing body is allowed (dates default server-side) → treat undefined as {}.
export const createRentalSchema = z.preprocess((v) => v ?? {}, createRentalBody);

export type CreateRentalInput = z.infer<typeof createRentalSchema>;
