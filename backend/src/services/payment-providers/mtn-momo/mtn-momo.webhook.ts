import type {
  NormalizedWebhookEvent,
  PaymentWebhookAdapter,
  WebhookVerificationContext,
} from '../../../types/payment';
import type { MtnConfig } from './mtn-momo.config';
import { mapMtnStatus } from './mtn-momo.mapping';

/**
 * MTN MoMo webhook adapter (B10) — implements the B9 `PaymentWebhookAdapter`.
 *
 * Authentication: the MTN Collection callback is NOT cryptographically signed
 * (per official docs), so we authenticate it with a SHARED SECRET that we embed
 * in the callback URL we register with MTN and/or send as a bearer token. The
 * adapter checks that secret in `verify()` — a caller who does not know it is
 * rejected (401) before any state changes. Defense in depth: correlation uses
 * the unguessable per-payment reference, and B9 re-checks amount/currency before
 * marking success; a future enhancement can re-fetch authoritative status via
 * the provider's `checkStatus`.
 *
 * Normalization: the callback body is the MTN request-to-pay status object
 * `{ externalId, status, amount, currency, financialTransactionId }`. We map it
 * to a `NormalizedWebhookEvent`: `externalId` (our reference) → correlation key,
 * `financialTransactionId` → event id for dedup, and only terminal outcomes
 * (SUCCESSFUL/FAILED) are accepted.
 */
export function createMtnWebhookAdapter(config: MtnConfig): PaymentWebhookAdapter {
  return {
    name: 'MTN_MOMO',

    async verify(ctx: WebhookVerificationContext): Promise<boolean> {
      const secret = config.callbackToken;
      if (!secret) return false; // no secret configured → cannot authenticate

      const auth = ctx.headers['authorization'];
      if (auth === `Bearer ${secret}`) return true;

      try {
        const token = new URL(ctx.url).searchParams.get('token');
        if (token === secret) return true;
      } catch {
        // malformed URL → not authenticated
      }
      return false;
    },

    normalize(ctx: WebhookVerificationContext): NormalizedWebhookEvent {
      const body = JSON.parse(ctx.rawBody) as Record<string, unknown>;

      const externalId = typeof body.externalId === 'string' ? body.externalId : null;
      const rawStatus = typeof body.status === 'string' ? body.status : '';
      const mapped = mapMtnStatus(rawStatus);
      // A callback must report a terminal outcome; PENDING is not applicable.
      if (mapped !== 'SUCCESSFUL' && mapped !== 'FAILED') {
        throw new Error('MTN callback is not a terminal outcome');
      }

      const amountStr = typeof body.amount === 'string' ? body.amount : null;
      const amount = amountStr !== null && /^\d+$/.test(amountStr) ? Number(amountStr) : null;

      return {
        provider: 'MTN_MOMO',
        externalEventId:
          typeof body.financialTransactionId === 'string' ? body.financialTransactionId : null,
        externalTransactionId: externalId,
        status: mapped,
        amount,
        currency: typeof body.currency === 'string' ? body.currency : null,
      };
    },
  };
}
