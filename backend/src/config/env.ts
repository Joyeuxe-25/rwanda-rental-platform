import { z } from 'zod';

import type { Bindings } from '../types';

/**
 * Schema for the non-secret configuration values expected on the Worker env.
 *
 * On Cloudflare Workers there is no `process.env`; configuration arrives per
 * request on `c.env`. This validates the subset the app reads, so a
 * misconfigured deployment fails clearly instead of behaving unexpectedly.
 * The D1 (`DB`) and R2 (`ASSETS`) bindings are validated for presence
 * separately where they are actually used.
 */
const configSchema = z.object({
  ENVIRONMENT: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Parse and validate configuration from the Worker env. Throws a ZodError if
 * invalid; the centralized error handler turns that into a safe 500.
 */
export function loadConfig(env: Bindings): AppConfig {
  return configSchema.parse({
    ENVIRONMENT: env.ENVIRONMENT,
    FRONTEND_URL: env.FRONTEND_URL,
  });
}

/** Convenience helper used in a few DB-independent spots (e.g. health, errors). */
export function isProduction(env: Pick<Bindings, 'ENVIRONMENT'>): boolean {
  return env.ENVIRONMENT === 'production';
}
