import type { Database } from '../db/client';
import type { User } from '../db/schema';
import * as userRepo from '../repositories/user.repository';
import type { SafeUser } from '../types';
import { ApiError } from '../utils/ApiError';
import { normalizePhone } from '../utils/normalize';
import type { UpdateProfileInput } from '../validators/user.validators';

/**
 * Profile service (B3). All operations act on the AUTHENTICATED user's id,
 * which the controller reads from the server-side session — never from client
 * input. No transactions (D1-compatible).
 */

/** Fetch the authenticated user's own profile as a SafeUser. */
export async function getProfile(db: Database, userId: string): Promise<SafeUser> {
  const user = await userRepo.findUserById(db, userId);
  if (!user) {
    // Session pointed at a user that no longer exists — safe, generic error.
    throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  }
  return userRepo.toSafeUser(user);
}

/**
 * Update the authenticated user's own editable profile fields.
 *
 * The allowed update object is constructed EXPLICITLY here (no spreading of the
 * request body), so only firstName/lastName/phone can ever reach the database —
 * role, email, id, and password are structurally excluded.
 */
export async function updateProfile(
  db: Database,
  userId: string,
  input: UpdateProfileInput,
): Promise<SafeUser> {
  const updates: Partial<Pick<User, 'firstName' | 'lastName' | 'phone'>> = {};

  if (input.firstName !== undefined) updates.firstName = input.firstName.trim();
  if (input.lastName !== undefined) updates.lastName = input.lastName.trim();

  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone);
    const existing = await userRepo.findUserByPhone(db, phone);
    if (existing && existing.id !== userId) {
      throw ApiError.conflict('Phone number is already in use', 'PHONE_ALREADY_IN_USE');
    }
    updates.phone = phone;
  }

  if (Object.keys(updates).length === 0) {
    // Defensive: the validator already rejects empty updates.
    throw ApiError.badRequest('No valid fields to update', 'NO_UPDATE_FIELDS');
  }

  let updated: User;
  try {
    updated = await userRepo.updateUserProfile(db, userId, updates);
  } catch (err) {
    // Handle the unique-phone race without leaking SQL details.
    const message = err instanceof Error ? err.message : '';
    if (/users\.phone/i.test(message)) {
      throw ApiError.conflict('Phone number is already in use', 'PHONE_ALREADY_IN_USE');
    }
    throw err;
  }

  return userRepo.toSafeUser(updated);
}
