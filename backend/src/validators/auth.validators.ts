import { z } from 'zod';

/**
 * Auth request schemas (B2). All use `.strict()` to reject unexpected fields.
 *
 * Password policy (central, deliberately simple): 8–128 characters. No forced
 * character-class rules — NIST guidance favors length over composition, and
 * arbitrary complexity harms usability without meaningfully improving security.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const emailSchema = z.string().trim().email('A valid email is required').max(254);
const phoneSchema = z.string().trim().min(7, 'A valid phone number is required').max(20);
const nameSchema = z.string().trim().min(1).max(100);

export const registerSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    role: z.enum(['LANDLORD', 'TENANT']),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required').max(128),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: passwordSchema,
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: passwordSchema,
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
