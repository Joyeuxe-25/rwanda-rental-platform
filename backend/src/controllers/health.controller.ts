import type { Context } from 'hono';

import type { AppEnv } from '../types';
import { sendSuccess } from '../utils/apiResponse';

/**
 * Health check controller. Confirms the Worker is up and responding.
 * Intentionally does NOT touch D1/R2 so it stays a cheap liveness probe.
 */
export function getHealth(c: Context<AppEnv>) {
  return sendSuccess(c, {
    message: 'Rwanda Rental Platform API is running',
    status: 'ok',
    environment: c.env.ENVIRONMENT ?? 'development',
    timestamp: new Date().toISOString(),
  });
}
