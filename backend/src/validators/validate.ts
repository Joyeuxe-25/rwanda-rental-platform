import type { MiddlewareHandler } from 'hono';
import { z, ZodError, type ZodTypeAny } from 'zod';

import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';

/**
 * Reusable request-validation mechanism (Zod) for Hono.
 *
 * Establishes the FOUNDATION only — no business schemas are defined here.
 * Later phases pass schemas for any of `json` (body), `query`, or `param`;
 * validated + transformed values are stashed on the context via `c.set()` and
 * can be read with `c.get('validatedBody' | 'validatedQuery' | 'validatedParams')`.
 *
 * On failure it throws an `ApiError` (422) with structured field-level details,
 * which the centralized error handler formats consistently.
 */
export interface RequestSchemas {
  json?: ZodTypeAny;
  query?: ZodTypeAny;
  param?: ZodTypeAny;
}

export function validate(schemas: RequestSchemas): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    try {
      if (schemas.json) {
        const raw = await c.req.json().catch(() => undefined);
        c.set('validatedBody', schemas.json.parse(raw));
      }
      if (schemas.query) {
        c.set('validatedQuery', schemas.query.parse(c.req.query()));
      }
      if (schemas.param) {
        c.set('validatedParams', schemas.param.parse(c.req.param()));
      }
      await next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw ApiError.validation('Request validation failed', details);
      }
      throw error;
    }
  };
}

/** Convenience type helper to infer a validated schema's TypeScript type. */
export type Infer<T extends ZodTypeAny> = z.infer<T>;
