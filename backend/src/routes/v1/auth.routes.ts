import { Hono } from 'hono';

import * as authController from '../../controllers/auth.controller';
import { requireAuth } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rateLimit';
import type { AppEnv } from '../../types';
import { validate } from '../../validators/validate';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../../validators/auth.validators';

/**
 * Authentication routes (B2), mounted at /api/v1/auth.
 *
 * Public:  register, login, forgot-password, reset-password
 * Authed:  logout, me, change-password (guarded by requireAuth)
 *
 * login/register carry a minimal rate-limit foundation (see rateLimit).
 */
const auth = new Hono<AppEnv>();

auth.post(
  '/register',
  rateLimit({ key: 'register', limit: 10, windowMs: 60 * 60 * 1000 }),
  validate({ json: registerSchema }),
  authController.register,
);

auth.post(
  '/login',
  rateLimit({ key: 'login', limit: 10, windowMs: 15 * 60 * 1000 }),
  validate({ json: loginSchema }),
  authController.login,
);

auth.post('/logout', requireAuth, authController.logout);

auth.get('/me', requireAuth, authController.me);

auth.post(
  '/change-password',
  requireAuth,
  validate({ json: changePasswordSchema }),
  authController.changePassword,
);

auth.post(
  '/forgot-password',
  rateLimit({ key: 'forgot', limit: 10, windowMs: 60 * 60 * 1000 }),
  validate({ json: forgotPasswordSchema }),
  authController.forgotPassword,
);

auth.post('/reset-password', validate({ json: resetPasswordSchema }), authController.resetPassword);

export default auth;
