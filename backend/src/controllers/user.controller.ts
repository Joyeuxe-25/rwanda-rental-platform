import type { Context } from 'hono';

import { getDb } from '../db/client';
import { getAuthUser } from '../middleware/auth';
import * as userService from '../services/user.service';
import type { AppEnv } from '../types';
import { logger } from '../lib/logger';
import { sendSuccess } from '../utils/apiResponse';
import type { UpdateProfileInput } from '../validators/user.validators';

/**
 * Profile controllers (B3). Thin HTTP layer: identity comes from the
 * authenticated session (`getAuthUser`), never from the request. Responses wrap
 * the SafeUser as `{ user }` inside the standard `{ success, data }` envelope.
 */

/** GET /api/v1/users/me — the authenticated user's own profile. */
export async function getMe(c: Context<AppEnv>) {
  const { id } = getAuthUser(c);
  const user = await userService.getProfile(getDb(c.env), id);
  return sendSuccess(c, { user });
}

/** PATCH /api/v1/users/me — update the authenticated user's own profile. */
export async function updateMe(c: Context<AppEnv>) {
  const { id } = getAuthUser(c);
  const input = c.get('validatedBody') as UpdateProfileInput;
  const user = await userService.updateProfile(getDb(c.env), id, input);
  logger.info('user.profile_updated', { userId: id, fields: Object.keys(input) });
  return sendSuccess(c, { user });
}
