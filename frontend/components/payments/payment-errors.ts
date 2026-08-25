import { ApiRequestError } from '@/lib/api';

/** Which flow raised the error — lets us tailor safe copy per action. */
export type PaymentContext = 'create' | 'list' | 'detail';

/**
 * A create error, classified for the UI. `uncertain` is the CRITICAL case: a
 * provider timeout (504) may have already created a PENDING payment, so the UI
 * must NOT say "no payment was created" and must NOT auto-retry.
 */
export interface PaymentCreateError {
  message: string;
  /** 504 provider timeout — payment state is uncertain; check status, do not retry. */
  uncertain: boolean;
  /** 409 idempotency reuse — the key was used with different parameters. */
  keyReuse: boolean;
}

/**
 * Map a backend error to SAFE, user-facing copy (F6). Never surfaces raw backend
 * or provider messages, codes, payloads, or credentials. Codes verified against
 * the B8/B10 payment service.
 */
export function paymentErrorMessage(err: unknown, context: PaymentContext): string {
  const generic = 'Something went wrong. Please try again.';
  if (!(err instanceof ApiRequestError)) return generic;

  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.status === 401) return 'Your session has expired. Please sign in again.';
  if (err.status === 403) return 'You do not have access to this payment.';

  switch (err.code) {
    case 'IDEMPOTENCY_KEY_REQUIRED':
      return 'We couldn’t start the payment. Please try again.';
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'This payment was already started with different details. Please review and try again.';
    case 'RENTAL_NOT_FOUND':
      return 'This rental could not be found.';
    case 'RENTAL_NOT_PAYABLE':
      return 'Payments are unavailable for this rental.';
    case 'PAYMENT_INVALID_AMOUNT':
      return 'The amount is not valid for this rental. It cannot exceed the monthly rent.';
    case 'PAYMENT_INVALID_PAYER':
      return 'Please check the mobile number on your account and try again.';
    case 'PAYMENT_PROVIDER_TIMEOUT':
      return 'Your payment request could not be confirmed yet. Check its status before trying again.';
    case 'PAYMENT_PROVIDER_ERROR':
      return 'MTN Mobile Money is temporarily unavailable. Please try again in a moment.';
    case 'PAYMENT_NOT_FOUND':
      return 'This payment could not be found.';
    default:
      break;
  }

  if (err.status === 404) return 'This payment could not be found.';
  if (err.status === 422) return 'Please check your details and try again.';

  return context === 'create' ? 'The payment could not be started. Please try again.' : generic;
}

/** Classify a create-flow error for the payment form. */
export function classifyCreateError(err: unknown): PaymentCreateError {
  const uncertain = err instanceof ApiRequestError && err.code === 'PAYMENT_PROVIDER_TIMEOUT';
  const keyReuse = err instanceof ApiRequestError && err.code === 'IDEMPOTENCY_KEY_REUSED';
  return { message: paymentErrorMessage(err, 'create'), uncertain, keyReuse };
}
