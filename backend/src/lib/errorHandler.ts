import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

import { isProduction } from '../config/env';
import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';
import { sendError } from '../utils/apiResponse';
import { logger } from './logger';

/**
 * Centralized error handler registered via `app.onError`. Normalizes every
 * thrown error into the consistent error envelope and ensures internals
 * (stack traces, raw messages for unexpected errors) never leak in production.
 */
export const onError: ErrorHandler<AppEnv> = (err, c) => {
  const path = c.req.path;

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) logger.error(err.message, { code: err.code, path });
    else logger.warn(err.message, { code: err.code, path });
    return sendError(c, err.statusCode, err.message, err.code, err.details);
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    logger.warn('Validation error', { path });
    return sendError(c, 422, 'Request validation failed', 'VALIDATION_ERROR', details);
  }

  // Hono's own HTTP exceptions (e.g. thrown by middleware).
  if (err instanceof HTTPException) {
    logger.warn(err.message, { status: err.status, path });
    return sendError(c, err.status, err.message, 'HTTP_ERROR');
  }

  // Anything else is unexpected.
  const prod = isProduction(c.env);
  logger.error('Unhandled error', {
    path,
    error: err instanceof Error ? err.message : String(err),
  });
  return sendError(
    c,
    500,
    prod ? 'Internal server error' : err instanceof Error ? err.message : 'Unknown error',
    'INTERNAL_SERVER_ERROR',
    prod ? undefined : { stack: err instanceof Error ? err.stack : undefined },
  );
};

/**
 * Catch-all for unmatched routes, registered via `app.notFound`. Produces the
 * standardized 404 error envelope.
 */
export const notFound: NotFoundHandler<AppEnv> = (c: Context<AppEnv>) => {
  return sendError(c, 404, `Route not found: ${c.req.method} ${c.req.path}`, 'ROUTE_NOT_FOUND');
};
