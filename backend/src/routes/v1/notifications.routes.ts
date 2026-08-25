import { Hono } from 'hono';

import * as controller from '../../controllers/notification.controller';
import { requireAuth } from '../../middleware/auth';
import type { AppEnv } from '../../types';

/**
 * Notification routes (B12), mounted at /api/v1/notifications. All require auth;
 * both LANDLORD and TENANT may use them (no role split, no admin). `/read-all`
 * is declared before `/:id` routes so the static segment wins over the param.
 */
const notifications = new Hono<AppEnv>();

notifications.get('/', requireAuth, controller.list);
notifications.patch('/read-all', requireAuth, controller.markAllRead);
notifications.get('/:id', requireAuth, controller.getOne);
notifications.patch('/:id/read', requireAuth, controller.markOneRead);

export default notifications;
