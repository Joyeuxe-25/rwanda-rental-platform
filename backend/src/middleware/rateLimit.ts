import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';

/**
 * Minimal in-memory fixed-window rate-limit FOUNDATION for security-sensitive
 * endpoints (login/register). Keyed by client IP + route.
 *
 * LIMITATIONS (documented): the counter lives in a single Worker isolate's
 * memory, so it resets on isolate recycling and is not shared across isolates.
 * It is a lightweight guard, NOT a distributed limiter. For production, enforce
 * limits at the edge via **Cloudflare Rate Limiting rules / WAF**, or back this
 * with a Durable Object / KV. Skipped in the `test` environment so it never
 * interferes with the test suite.
 */
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function rateLimit(options: {
  limit: number;
  windowMs: number;
  key: string;
}): MiddlewareHandler<AppEnv> {
  const { limit, windowMs, key } = options;
  return async (c, next) => {
    if (c.env.ENVIRONMENT === 'test') {
      await next();
      return;
    }

    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const bucketKey = `${key}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > limit) {
        throw new ApiError(429, 'Too many requests, please try again later', 'AUTH_RATE_LIMITED');
      }
    }
    await next();
  };
}
