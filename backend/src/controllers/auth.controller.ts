import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';

import {
  SESSION_COOKIE_NAME,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from '../config/auth';
import { isProduction } from '../config/env';
import { getDb } from '../db/client';
import { getAuthUser } from '../middleware/auth';
import * as authService from '../services/auth.service';
import type { AppEnv } from '../types';
import { logger } from '../lib/logger';
import { sendSuccess } from '../utils/apiResponse';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '../validators/auth.validators';

/**
 * Auth controllers — thin HTTP layer. Validation runs in middleware (parsed
 * input on `c.get('validatedBody')`); business logic lives in the service.
 * Controllers own cookie handling and response shaping only.
 */

/** POST /api/v1/auth/register */
export async function register(c: Context<AppEnv>) {
  const input = c.get('validatedBody') as RegisterInput;
  const { user, token } = await authService.register(getDb(c.env), input);
  setCookie(c, SESSION_COOKIE_NAME, token, sessionCookieOptions(c.env));
  logger.info('auth.register', { userId: user.id, role: user.role });
  return sendSuccess(c, user, 201);
}

/** POST /api/v1/auth/login */
export async function login(c: Context<AppEnv>) {
  const input = c.get('validatedBody') as LoginInput;
  const { user, token } = await authService.login(getDb(c.env), input);
  setCookie(c, SESSION_COOKIE_NAME, token, sessionCookieOptions(c.env));
  logger.info('auth.login', { userId: user.id });
  return sendSuccess(c, user, 200);
}

/** POST /api/v1/auth/logout (requires auth) */
export async function logout(c: Context<AppEnv>) {
  const session = c.get('session');
  if (session) {
    await authService.logout(getDb(c.env), session.id);
    logger.info('auth.logout', { userId: session.userId });
  }
  deleteCookie(c, SESSION_COOKIE_NAME, clearSessionCookieOptions(c.env));
  return sendSuccess(c, { message: 'Logged out' });
}

/** GET /api/v1/auth/me (requires auth) */
export function me(c: Context<AppEnv>) {
  return sendSuccess(c, getAuthUser(c));
}

/** POST /api/v1/auth/change-password (requires auth) */
export async function changePassword(c: Context<AppEnv>) {
  const user = getAuthUser(c);
  const input = c.get('validatedBody') as ChangePasswordInput;
  const { token } = await authService.changePassword(getDb(c.env), user.id, input);
  // A fresh session replaces the now-revoked ones.
  setCookie(c, SESSION_COOKIE_NAME, token, sessionCookieOptions(c.env));
  logger.info('auth.change_password', { userId: user.id });
  return sendSuccess(c, { message: 'Password changed' });
}

/** POST /api/v1/auth/forgot-password */
export async function forgotPassword(c: Context<AppEnv>) {
  const input = c.get('validatedBody') as ForgotPasswordInput;
  const token = await authService.forgotPassword(getDb(c.env), input.email);
  logger.info('auth.forgot_password_requested');

  // Generic response — never reveals whether the account exists.
  const body: { message: string; devResetToken?: string } = {
    message: 'If the account exists, password reset instructions have been prepared.',
  };
  // Email delivery is deferred (B2). For local dev/testing ONLY (never in
  // production), expose the raw token so the reset flow can be exercised.
  if (!isProduction(c.env) && token) {
    body.devResetToken = token;
  }
  return sendSuccess(c, body);
}

/** POST /api/v1/auth/reset-password */
export async function resetPassword(c: Context<AppEnv>) {
  const input = c.get('validatedBody') as ResetPasswordInput;
  await authService.resetPassword(getDb(c.env), input);
  logger.info('auth.reset_password');
  return sendSuccess(c, { message: 'Password has been reset. Please log in again.' });
}
