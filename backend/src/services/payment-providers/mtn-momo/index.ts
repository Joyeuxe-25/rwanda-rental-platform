import type { Bindings } from '../../../types';
import type { PaymentProvider } from '../../../types/payment';
import { registerWebhookAdapter } from '../registry';
import { loadMtnConfig } from './mtn-momo.config';
import { createMtnProvider } from './mtn-momo.provider';
import { createMtnWebhookAdapter } from './mtn-momo.webhook';

/**
 * MTN wiring (B10). Because Cloudflare Worker secrets are only available
 * per-request (`c.env`), we register/resolve lazily rather than at module load.
 *
 * - `ensureMtnRegistered(env)`: registers the MTN webhook adapter into the B9
 *   registry IF MTN is configured. Idempotent (a plain Map.set); safe to call
 *   on every request. When MTN is NOT configured it does nothing, preserving the
 *   provider-independent B8/B9 behavior.
 * - `resolveMtnProvider(env)`: returns the MTN `PaymentProvider` for payment
 *   initiation, or null when MTN is not configured.
 */
export function ensureMtnRegistered(env: Bindings): void {
  const config = loadMtnConfig(env);
  if (!config) return;
  registerWebhookAdapter(createMtnWebhookAdapter(config));
}

export function resolveMtnProvider(env: Bindings): PaymentProvider | null {
  const config = loadMtnConfig(env);
  if (!config) return null;
  return createMtnProvider(config);
}
