import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppEnv } from '../types';

/** Standard success envelope: { success: true, data, meta? } */
export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/** Standard error envelope: { success: false, error: { message, code, details? } } */
export interface ErrorBody {
  success: false;
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
}

/** Send a consistent success response. */
export function sendSuccess<T>(
  c: Context<AppEnv>,
  data: T,
  status: ContentfulStatusCode = 200,
  meta?: Record<string, unknown>,
) {
  const body: SuccessBody<T> = { success: true, data };
  if (meta) body.meta = meta;
  return c.json(body, status);
}

/** Send a consistent error response (used by the centralized error handler). */
export function sendError(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  message: string,
  code: string,
  details?: unknown,
) {
  const body: ErrorBody = { success: false, error: { message, code } };
  if (details !== undefined) body.error.details = details;
  return c.json(body, status);
}
