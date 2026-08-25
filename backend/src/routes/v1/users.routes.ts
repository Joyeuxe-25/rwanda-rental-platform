import { Hono } from 'hono';

import * as userController from '../../controllers/user.controller';
import { requireAuth } from '../../middleware/auth';
import type { AppEnv } from '../../types';
import { validate } from '../../validators/validate';
import { updateProfileSchema } from '../../validators/user.validators';

/**
 * User profile routes (B3), mounted at /api/v1/users.
 *
 * Both endpoints require authentication and operate ONLY on the authenticated
 * user (`/me`). There is intentionally NO `/users/:id` route — ownership is
 * always derived from the server-side session. Both roles (LANDLORD, TENANT)
 * have identical access to their own profile.
 */
const users = new Hono<AppEnv>();

users.get('/me', requireAuth, userController.getMe);

users.patch('/me', requireAuth, validate({ json: updateProfileSchema }), userController.updateMe);

export default users;
