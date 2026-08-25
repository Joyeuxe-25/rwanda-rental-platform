import { ApiRequestError } from '@/lib/api';

/** Which flow raised the error — lets us tailor safe copy per action. */
export type RentalRequestContext = 'create' | 'list' | 'detail' | 'cancel' | 'approve' | 'reject';

/**
 * Map a backend error to SAFE, user-facing copy (F4). Never surfaces raw backend
 * messages, codes, SQL, or stack traces. Backend codes are verified against the
 * B6 rental-request service (PROPERTY_NOT_FOUND / PROPERTY_NOT_PUBLISHED /
 * PROPERTY_NOT_AVAILABLE / RENTAL_REQUEST_ALREADY_EXISTS / _NOT_FOUND /
 * _ALREADY_PROCESSED / _CANNOT_BE_CANCELLED).
 */
export function rentalRequestErrorMessage(err: unknown, context: RentalRequestContext): string {
  const generic = 'Something went wrong. Please try again.';
  if (!(err instanceof ApiRequestError)) return generic;

  // Cross-cutting HTTP cases.
  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.status === 401) return 'Your session has expired. Please sign in again.';
  if (err.status === 403) return 'You do not have access to this rental request.';

  // Backend business codes (safe to map to copy — never shown raw).
  switch (err.code) {
    case 'PROPERTY_NOT_FOUND':
      return 'This property could not be found.';
    case 'PROPERTY_NOT_PUBLISHED':
    case 'PROPERTY_NOT_AVAILABLE':
      return 'This property is no longer available to request.';
    case 'RENTAL_REQUEST_ALREADY_EXISTS':
      return 'You already have an active request for this property.';
    case 'RENTAL_REQUEST_NOT_FOUND':
      return 'This rental request could not be found.';
    case 'RENTAL_REQUEST_ALREADY_PROCESSED':
      return 'This request has already been processed.';
    case 'RENTAL_REQUEST_CANNOT_BE_CANCELLED':
      return 'This request can no longer be cancelled.';
    default:
      break;
  }

  if (err.status === 404) return 'This rental request could not be found.';
  if (err.status === 422) return 'Please check your details and try again.';

  // Context-specific fallbacks.
  switch (context) {
    case 'create':
      return 'Your request could not be sent. Please try again.';
    case 'cancel':
      return 'The request could not be cancelled. Please try again.';
    case 'approve':
    case 'reject':
      return 'The request could not be updated. Please try again.';
    default:
      return generic;
  }
}
