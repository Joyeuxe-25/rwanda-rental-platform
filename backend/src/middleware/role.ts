import type { MiddlewareHandler } from 'hono';

import type { AppEnv, SafeUser } from '../types';
import { ApiError } from '../utils/ApiError';

/** Application roles. There is intentionally NO admin role. */
export type AppRole = SafeUser['role'];

/**
 * Role-based authorization middleware. MUST run after `requireAuth`. Allows the
 * request only when the authenticated user's role matches; otherwise 403.
 *
 * Usage: `auth.get('/landlord-only', requireAuth, requireRole('LANDLORD'), handler)`
 */
export function requireRole(...allowed: AppRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      // Defensive: requireAuth should have run first.
      throw ApiError.unauthorized('Authentication required', 'AUTH_UNAUTHORIZED');
    }
    if (!allowed.includes(user.role)) {
      throw ApiError.forbidden(
        'You do not have permission to perform this action',
        'AUTH_FORBIDDEN',
      );
    }
    await next();
  };
}
