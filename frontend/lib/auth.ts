import { api, ApiRequestError } from '@/lib/api';
import type { AuthUser, LoginInput, RegisterInput } from '@/types/auth';

/**
 * Authentication data access (F3). Reuses the F0 API client (cookie-credentialed,
 * envelope-aware). All requests carry `credentials: 'include'` so the backend's
 * HttpOnly `rrp_session` cookie is sent/received — there is NO token storage,
 * NO Authorization/Bearer header, and NO localStorage/JWT.
 */

/** GET /auth/me → the current user, or `null` when unauthenticated (401). */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    return await api.get<AuthUser>('/auth/me', { cache: 'no-store' });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) return null;
    throw err; // network/other errors bubble to the caller
  }
}

/** POST /auth/login → SafeUser (sets the session cookie). */
export function loginRequest(input: LoginInput): Promise<AuthUser> {
  return api.post<AuthUser>('/auth/login', input);
}

/** POST /auth/register → SafeUser (auto-login; sets the session cookie). */
export function registerRequest(input: RegisterInput): Promise<AuthUser> {
  return api.post<AuthUser>('/auth/register', input);
}

/** POST /auth/logout → revokes the session server-side and clears the cookie. */
export function logoutRequest(): Promise<unknown> {
  return api.post('/auth/logout');
}

/** POST /auth/change-password (revokes existing sessions server-side). */
export function changePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<unknown> {
  return api.post('/auth/change-password', input);
}

/** POST /auth/forgot-password — always a generic result (privacy-preserving). */
export function forgotPasswordRequest(input: { email: string }): Promise<unknown> {
  return api.post('/auth/forgot-password', input);
}

/** POST /auth/reset-password — consumes a reset token; revokes sessions. */
export function resetPasswordRequest(input: {
  token: string;
  newPassword: string;
}): Promise<unknown> {
  return api.post('/auth/reset-password', input);
}

/**
 * Sanitize a `returnTo` value into a SAFE internal relative path. Blocks open
 * redirects: only paths beginning with a single `/` (then a non-slash,
 * non-backslash char) are allowed — never protocol-relative (`//host`), absolute
 * URLs (`https://…`), backslashes, whitespace, or scheme-like values
 * (`javascript:`/`data:`). Falls back to `/` otherwise. The original (encoded)
 * value is returned so query strings survive navigation.
 */
export function safeInternalPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || typeof value !== 'string') return fallback;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  const ok = (c: string): boolean =>
    /^\/(?!\/)(?![\\])[^\s\\]*$/.test(c) && !/(?:javascript|data|vbscript|file):/i.test(c);

  if (!ok(value) || !ok(decoded)) return fallback;
  return value;
}
