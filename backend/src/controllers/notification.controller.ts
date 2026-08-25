import type { Context } from 'hono';

import { getDb } from '../db/client';
import { getAuthUser } from '../middleware/auth';
import * as service from '../services/notification.service';
import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import { listNotificationsQuerySchema } from '../validators/notification.validators';

/**
 * Notification controllers (B12). Thin: identity from the session; validated
 * query for listing; ids from the route. Both roles may use these endpoints.
 */
function param(c: Context<AppEnv>, name: string): string {
  const v = c.req.param(name);
  if (!v) throw ApiError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
  return v;
}

/** GET /api/v1/notifications */
export async function list(c: Context<AppEnv>) {
  const { id: userId } = getAuthUser(c);
  const parsed = listNotificationsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw ApiError.validation('Invalid notification query', 'NOTIFICATION_INVALID_QUERY');
  }
  const q = parsed.data;
  const result = await service.list(getDb(c.env), userId, {
    page: q.page,
    limit: q.limit,
    unread: q.unread === undefined ? undefined : q.unread === 'true',
    type: q.type,
  });
  return sendSuccess(c, result);
}

/** GET /api/v1/notifications/:id */
export async function getOne(c: Context<AppEnv>) {
  const { id: userId } = getAuthUser(c);
  const notification = await service.getOne(getDb(c.env), userId, param(c, 'id'));
  return sendSuccess(c, { notification });
}

/** PATCH /api/v1/notifications/:id/read */
export async function markOneRead(c: Context<AppEnv>) {
  const { id: userId } = getAuthUser(c);
  const notification = await service.markOneRead(getDb(c.env), userId, param(c, 'id'));
  return sendSuccess(c, { notification });
}

/** PATCH /api/v1/notifications/read-all */
export async function markAllRead(c: Context<AppEnv>) {
  const { id: userId } = getAuthUser(c);
  const result = await service.markAllRead(getDb(c.env), userId);
  return sendSuccess(c, result);
}
