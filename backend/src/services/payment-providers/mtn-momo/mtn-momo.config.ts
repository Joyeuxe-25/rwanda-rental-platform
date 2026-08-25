import type { Bindings } from '../../../types';
import { ApiError } from '../../../utils/ApiError';

/**
 * MTN MoMo configuration (B10). Read from Cloudflare Worker env/secrets — NEVER
 * hard-coded and NEVER logged. If the core credentials are absent, MTN is
 * considered INACTIVE (`loadMtnConfig` returns null) and the app keeps its
 * provider-independent B8/B9 behavior (useful for tests that don't exercise MTN).
 *
 * Production safety: if the code runs in a non-production ENVIRONMENT
 * (development/test) but points at MTN `production`, we FAIL SAFE rather than
 * risk moving real money from a dev build.
 *
 * Official MTN sources consulted (see README "MTN MoMo Integration (B10)"):
 *   https://momodeveloper.mtn.com/api-documentation/api-description/
 */
export interface MtnConfig {
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  targetEnvironment: string; // 'sandbox' | 'production'
  callbackToken: string | null;
  callbackUrl: string | null;
}

/** Request/network timeout for outbound MTN calls (ms). Bounded — no hangs. */
export const MTN_REQUEST_TIMEOUT_MS = 10_000;

export function loadMtnConfig(env: Bindings): MtnConfig | null {
  const baseUrl = env.MTN_MOMO_BASE_URL;
  const subscriptionKey = env.MTN_MOMO_SUBSCRIPTION_KEY;
  const apiUser = env.MTN_MOMO_API_USER;
  const apiKey = env.MTN_MOMO_API_KEY;
  const targetEnvironment = env.MTN_MOMO_TARGET_ENVIRONMENT ?? 'sandbox';

  // MTN is only active when the core credentials are all present.
  if (!baseUrl || !subscriptionKey || !apiUser || !apiKey) return null;

  // Fail safe: a non-production build may ONLY target the MTN sandbox.
  //
  // MTN's production `X-Target-Environment` is a COUNTRY identifier (e.g.
  // `mtnrwanda`), NOT the literal "production" — so we cannot block by matching
  // "production". Instead we allow-list the single safe value (`sandbox`) in
  // dev/test and refuse anything else (mtnrwanda, production, etc.), which is
  // robust regardless of the exact production identifier.
  const appEnv = env.ENVIRONMENT ?? 'development';
  if (appEnv !== 'production' && targetEnvironment !== 'sandbox') {
    throw new ApiError(
      500,
      'Refusing to use a non-sandbox MTN target environment outside production',
      'MTN_UNSAFE_ENVIRONMENT',
      undefined,
      false,
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    subscriptionKey,
    apiUser,
    apiKey,
    targetEnvironment,
    callbackToken: env.MTN_MOMO_CALLBACK_TOKEN ?? null,
    callbackUrl: env.MTN_MOMO_CALLBACK_URL ?? null,
  };
}
