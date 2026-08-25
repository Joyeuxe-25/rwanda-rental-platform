import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

import { SESSION_COOKIE_NAME } from '../config/auth';
import { getDb } from '../db/client';
import { hashToken } from '../lib/crypto/tokens';
import * as sessionRepo from '../repositories/session.repository';
import * as userRepo from '../repositories/user.repository';
import type { AppEnv, SafeUser } from '../types';
import { ApiError } from '../utils/ApiError';
import { logger } from '../lib/logger';

/**
 * Authentication middleware. Validates the session cookie and attaches the
 * authenticated `user` and `session` to the Hono context. Any failure results
 * in a 401 with the standard error envelope — never leaking DB internals.
 *
 * Flow: read cookie → hash token → look up session by hash → check
 * revoked/expired → load user → attach to context.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const raw = getCookie(c, SESSION_COOKIE_NAME);
  if (!raw) {
    throw ApiError.unauthorized('Authentication required', 'AUTH_UNAUTHORIZED');
  }

  const db = getDb(c.env);
  const tokenHash = await hashToken(raw);
  const session = await sessionRepo.findSessionByTokenHash(db, tokenHash);

  if (!session) {
    throw ApiError.unauthorized('Invalid session', 'AUTH_SESSION_INVALID');
  }
  if (session.revokedAt) {
    throw ApiError.unauthorized('Session has been revoked', 'AUTH_SESSION_INVALID');
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('Session has expired', 'AUTH_SESSION_EXPIRED');
  }

  const user = await userRepo.findUserById(db, session.userId);
  if (!user) {
    throw ApiError.unauthorized('Invalid session', 'AUTH_SESSION_INVALID');
  }

  // Best-effort last-used update (non-blocking correctness; ignore failures).
  try {
    await sessionRepo.touchSession(db, session.id);
  } catch {
    // ignore — updating last_used_at must never fail the request
  }

  c.set('session', session);
  c.set('user', userRepo.toSafeUser(user));
  await next();
};

/**
 * Non-null accessor for the authenticated user. Use inside handlers that run
 * AFTER `requireAuth`. Throws (500-safe) if called without authentication.
 */
export function getAuthUser(c: Context<AppEnv>): SafeUser {
  const user = c.get('user');
  if (!user) {
    logger.error('getAuthUser called without requireAuth');
    throw ApiError.unauthorized('Authentication required', 'AUTH_UNAUTHORIZED');
  }
  return user;
}
