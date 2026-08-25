import type { CookieOptions } from 'hono/utils/cookie';

import { isProduction } from './env';
import type { Bindings } from '../types';

/**
 * Authentication configuration (B2).
 *
 * Session lifetime is 7 days — long enough to avoid constant re-login, short
 * enough to bound the exposure of a leaked cookie. Password-reset tokens live
 * 1 hour (single-use). Adjust here in one place.
 */
export const SESSION_COOKIE_NAME = 'rrp_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Build the Set-Cookie options for the session cookie.
 *
 * - `httpOnly`  — JS cannot read it (mitigates XSS token theft).
 * - `secure`    — only over HTTPS in production (allows plain HTTP on localhost).
 * - `sameSite`  — defaults to `Lax` (works for localhost dev and same-site
 *                 subdomain deployments). A fully cross-site frontend must set
 *                 `SESSION_SAMESITE=None` (which forces Secure, hence HTTPS).
 * - `path`      — `/` so the cookie covers the whole API.
 * - `maxAge`    — explicit lifetime in seconds (never a permanent cookie).
 */
export function sessionCookieOptions(env: Bindings): CookieOptions {
  const sameSite = (env.SESSION_SAMESITE ?? 'Lax') as 'Lax' | 'Strict' | 'None';
  const prod = isProduction(env);
  return {
    httpOnly: true,
    secure: prod || sameSite === 'None',
    sameSite,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** Options used when clearing the cookie (must match attributes except maxAge). */
export function clearSessionCookieOptions(env: Bindings): CookieOptions {
  const sameSite = (env.SESSION_SAMESITE ?? 'Lax') as 'Lax' | 'Strict' | 'None';
  const prod = isProduction(env);
  return {
    httpOnly: true,
    secure: prod || sameSite === 'None',
    sameSite,
    path: '/',
  };
}
