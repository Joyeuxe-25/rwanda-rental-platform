import { logger } from '../../../lib/logger';
import type { PaymentProvider, PaymentProviderResult } from '../../../types/payment';
import { ApiError } from '../../../utils/ApiError';
import type { MtnConfig } from './mtn-momo.config';
import {
  getAccessToken,
  getRequestToPayStatus,
  MtnHttpError,
  requestToPay,
} from './mtn-momo.client';
import { mapMtnStatus, toMsisdn } from './mtn-momo.mapping';

/**
 * MTN MoMo payment provider (B10) — implements the B8 `PaymentProvider`
 * contract. `initiate` triggers a Request-to-Pay; it NEVER marks the payment
 * successful (the result stays PENDING). The `reference` is our stable
 * per-payment id used as MTN's `X-Reference-Id`, so a retry re-uses it and MTN
 * dedupes (409) — no double charge. Raw MTN errors are mapped to safe codes and
 * never surfaced to clients.
 */

/** Map a low-level MTN client error to a safe ApiError (no secret leakage). */
function toSafeError(err: unknown): ApiError {
  if (err instanceof MtnHttpError) {
    // Log only the safe kind/status — never bodies, tokens, or credentials.
    logger.error('mtn.request_error', { kind: err.kind, status: err.status });
    if (err.kind === 'TIMEOUT') {
      return new ApiError(
        504,
        'Payment provider timed out, please try again',
        'PAYMENT_PROVIDER_TIMEOUT',
      );
    }
    if (err.kind === 'AUTH') {
      return new ApiError(
        502,
        'Payment provider configuration error',
        'PAYMENT_PROVIDER_ERROR',
        undefined,
        false,
      );
    }
    return new ApiError(
      502,
      'Payment provider is unavailable, please try again',
      'PAYMENT_PROVIDER_ERROR',
    );
  }
  logger.error('mtn.unexpected_error');
  return new ApiError(
    502,
    'Payment provider is unavailable, please try again',
    'PAYMENT_PROVIDER_ERROR',
  );
}

export function createMtnProvider(config: MtnConfig): PaymentProvider {
  return {
    name: 'MTN_MOMO',

    async initiate(input): Promise<PaymentProviderResult> {
      const msisdn = toMsisdn(input.payerPhone);
      if (!/^\d{9,15}$/.test(msisdn)) {
        // Fail before contacting MTN if the stored phone is unusable.
        throw new ApiError(
          422,
          'Payer phone number is not valid for mobile money',
          'PAYMENT_INVALID_PAYER',
        );
      }
      try {
        const token = await getAccessToken(config);
        const outcome = await requestToPay(config, token, {
          referenceId: input.reference,
          amount: String(input.amount), // integer RWF → string, no decimals
          currency: input.currency,
          externalId: input.reference, // echoed back → correlation key
          payerMsisdn: msisdn,
        });
        logger.info('mtn.request_to_pay', { reference: input.reference, outcome });
        // ACCEPTED (202) or DUPLICATE (409) → the charge is in progress.
        return { externalTransactionId: input.reference, status: 'PENDING' };
      } catch (err) {
        throw toSafeError(err);
      }
    },

    async checkStatus(externalTransactionId): Promise<PaymentProviderResult> {
      try {
        const token = await getAccessToken(config);
        const result = await getRequestToPayStatus(config, token, externalTransactionId);
        return {
          externalTransactionId,
          status: mapMtnStatus(result.status),
          reference: result.financialTransactionId ?? undefined,
        };
      } catch (err) {
        throw toSafeError(err);
      }
    },
  };
}
