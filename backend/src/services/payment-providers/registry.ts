import { ApiError } from '../../utils/ApiError';
import type { PaymentProviderName, PaymentWebhookAdapter } from '../../types/payment';

/**
 * Provider webhook-adapter registry (B9).
 *
 * A provider-neutral factory. It starts EMPTY — B9 ships NO concrete adapters.
 * The real MTN (B10) and Airtel (B11) integrations will call
 * `registerWebhookAdapter(...)` at module load. Until then, looking up a
 * provider fails safely with `WEBHOOK_PROVIDER_NOT_IMPLEMENTED` (501).
 *
 * Tests register a test-only adapter at runtime; because the registry is empty
 * by default, no test code is ever packaged into production behavior.
 */
const adapters = new Map<PaymentProviderName, PaymentWebhookAdapter>();

export function registerWebhookAdapter(adapter: PaymentWebhookAdapter): void {
  adapters.set(adapter.name, adapter);
}

/** Test/reset helper — clears registered adapters. */
export function clearWebhookAdapters(): void {
  adapters.clear();
}

/** Resolve the adapter for a provider, or fail safely if none is registered. */
export function getWebhookAdapter(provider: PaymentProviderName): PaymentWebhookAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new ApiError(
      501,
      `Webhooks for ${provider} are not implemented yet`,
      'WEBHOOK_PROVIDER_NOT_IMPLEMENTED',
    );
  }
  return adapter;
}
