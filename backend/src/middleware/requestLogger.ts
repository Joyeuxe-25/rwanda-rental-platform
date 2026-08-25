import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../types';
import { logger } from '../lib/logger';

/**
 * Request logging middleware. Logs method, path, status, and duration for each
 * request. Deliberately does NOT log headers or bodies to avoid leaking
 * secrets (authorization, cookies, credentials). Also assigns a request id
 * (from the incoming CF-Ray/`x-request-id` header when present) for tracing.
 */
export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? c.req.header('cf-ray') ?? crypto.randomUUID();
  c.set('requestId', requestId);

  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  logger.info('request', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  });
};
