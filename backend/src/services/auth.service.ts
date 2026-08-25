import type { Database } from '../db/client';
import { RESET_TOKEN_TTL_MS, SESSION_TTL_MS } from '../config/auth';
import { hashPassword, verifyPassword } from '../lib/crypto/password';
import { generateToken, hashToken } from '../lib/crypto/tokens';
import * as resetRepo from '../repositories/password-reset.repository';
import * as sessionRepo from '../repositories/session.repository';
import * as userRepo from '../repositories/user.repository';
import type { SafeUser } from '../types';
import { ApiError } from '../utils/ApiError';
import { normalizeEmail, normalizePhone } from '../utils/normalize';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '../validators/auth.validators';

/**
 * Authentication service (B2) — orchestrates repositories + crypto. Contains no
 * HTTP concerns (cookies/status live in the controller) and uses no interactive
 * transactions, keeping it compatible with Cloudflare D1.
 *
 * The service returns the RAW session token to the controller so it can set the
 * HttpOnly cookie; the raw token is never persisted or logged (only its hash is
 * stored).
 */

// A well-formed but non-matching hash, used to keep login timing similar
// whether or not the email exists (mitigates user-enumeration via timing).
const DUMMY_HASH =
  'pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

async function issueSession(db: Database, userId: string): Promise<string> {
  const { token, tokenHash } = await generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sessionRepo.createSession(db, { userId, tokenHash, expiresAt });
  return token;
}

export interface AuthResult {
  user: SafeUser;
  token: string;
}

export async function register(db: Database, input: RegisterInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);

  if (await userRepo.findUserByEmail(db, email)) {
    throw ApiError.conflict('An account with this email already exists', 'AUTH_EMAIL_EXISTS');
  }
  if (await userRepo.findUserByPhone(db, phone)) {
    throw ApiError.conflict(
      'An account with this phone number already exists',
      'AUTH_PHONE_EXISTS',
    );
  }

  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await userRepo.insertUser(db, {
      role: input.role,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone,
      passwordHash,
    });
  } catch (err) {
    // Handle the unique-constraint race without leaking SQL details.
    const message = err instanceof Error ? err.message : '';
    if (/users\.email/i.test(message)) {
      throw ApiError.conflict('An account with this email already exists', 'AUTH_EMAIL_EXISTS');
    }
    if (/users\.phone/i.test(message)) {
      throw ApiError.conflict(
        'An account with this phone number already exists',
        'AUTH_PHONE_EXISTS',
      );
    }
    throw err;
  }

  const token = await issueSession(db, user.id);
  return { user: userRepo.toSafeUser(user), token };
}

export async function login(db: Database, input: LoginInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const user = await userRepo.findUserByEmail(db, email);

  if (!user) {
    // Spend comparable time so a missing account is not distinguishable.
    await verifyPassword(input.password, DUMMY_HASH);
    throw ApiError.unauthorized('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
  }

  const token = await issueSession(db, user.id);
  return { user: userRepo.toSafeUser(user), token };
}

export async function logout(db: Database, sessionId: string): Promise<void> {
  await sessionRepo.revokeSession(db, sessionId);
}

export async function changePassword(
  db: Database,
  userId: string,
  input: ChangePasswordInput,
): Promise<{ token: string }> {
  const user = await userRepo.findUserById(db, userId);
  if (!user) {
    throw ApiError.unauthorized('Not authenticated', 'AUTH_UNAUTHORIZED');
  }

  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Current password is incorrect', 'AUTH_PASSWORD_INVALID');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await userRepo.updateUserPasswordHash(db, userId, passwordHash);

  // Invalidate all existing sessions, then start a fresh one for this request.
  await sessionRepo.revokeAllUserSessions(db, userId);
  const token = await issueSession(db, userId);
  return { token };
}

/**
 * Begin a password reset. Returns the RAW token when the account exists (so the
 * caller could email it — email delivery is deferred in B2), or `null` when it
 * does not. The controller must NOT reveal which case occurred to the client.
 */
export async function forgotPassword(db: Database, emailInput: string): Promise<string | null> {
  const email = normalizeEmail(emailInput);
  const user = await userRepo.findUserByEmail(db, email);
  if (!user) return null;

  await resetRepo.invalidateUserResetTokens(db, user.id);
  const { token, tokenHash } = await generateToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await resetRepo.createResetToken(db, { userId: user.id, tokenHash, expiresAt });
  return token;
}

export async function resetPassword(db: Database, input: ResetPasswordInput): Promise<void> {
  const tokenHash = await hashToken(input.token);
  const record = await resetRepo.findResetByTokenHash(db, tokenHash);

  if (!record || record.usedAt) {
    throw ApiError.badRequest('Invalid or already-used reset token', 'AUTH_PASSWORD_RESET_INVALID');
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('Reset token has expired', 'AUTH_PASSWORD_RESET_EXPIRED');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await userRepo.updateUserPasswordHash(db, record.userId, passwordHash);

  // Single-use: consume this token, invalidate any siblings, and revoke sessions.
  await resetRepo.markResetTokenUsed(db, record.id);
  await resetRepo.invalidateUserResetTokens(db, record.userId);
  await sessionRepo.revokeAllUserSessions(db, record.userId);
}
