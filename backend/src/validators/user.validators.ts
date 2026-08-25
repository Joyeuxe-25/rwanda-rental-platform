import { z } from 'zod';

/**
 * Profile update schema (B3).
 *
 * Only these fields are editable: firstName, lastName, phone. `.strict()`
 * rejects any other key (role, email, id, userId, password, ...) with a 422,
 * so role changes / mass-assignment / ownership tampering are refused at the
 * validation boundary. At least one field must be present (empty updates 422).
 *
 * Email and role are intentionally NOT editable here:
 *  - email would require a verification flow that does not exist yet;
 *  - role is immutable (there is no role-management API).
 * Password changes live under the existing B2 endpoint POST /auth/change-password.
 */
const nameSchema = z.string().trim().min(1, 'Must not be empty').max(100);
const phoneSchema = z.string().trim().min(7, 'A valid phone number is required').max(20);

export const updateProfileSchema = z
  .object({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
