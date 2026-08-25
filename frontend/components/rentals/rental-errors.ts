import { ApiRequestError } from '@/lib/api';

/** Which flow raised the error — lets us tailor safe copy per action. */
export type RentalContext = 'convert' | 'list' | 'detail' | 'complete' | 'terminate';

/**
 * Map a backend error to SAFE, user-facing copy (F5). Never surfaces raw backend
 * messages, codes, SQL, or stack traces. Backend codes are verified against the
 * B7 rental service (RENTAL_REQUEST_NOT_FOUND / RENTAL_REQUEST_NOT_ACCEPTED /
 * RENTAL_ALREADY_EXISTS / PROPERTY_NOT_PUBLISHED / PROPERTY_NOT_AVAILABLE /
 * RENTAL_NOT_FOUND / RENTAL_NOT_ACTIVE).
 */
export function rentalErrorMessage(err: unknown, context: RentalContext): string {
  const generic = 'Something went wrong. Please try again.';
  if (!(err instanceof ApiRequestError)) return generic;

  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.status === 401) return 'Your session has expired. Please sign in again.';
  if (err.status === 403) return 'You do not have access to this rental.';

  switch (err.code) {
    case 'RENTAL_REQUEST_NOT_FOUND':
      return 'This rental request could not be found.';
    case 'RENTAL_REQUEST_NOT_ACCEPTED':
      return 'This request has not been accepted, so it cannot be started as a rental.';
    case 'RENTAL_ALREADY_EXISTS':
      return 'This request has already been started as a rental.';
    case 'PROPERTY_NOT_PUBLISHED':
    case 'PROPERTY_NOT_AVAILABLE':
      return 'This property is no longer available to rent.';
    case 'RENTAL_NOT_FOUND':
      return 'This rental could not be found.';
    case 'RENTAL_NOT_ACTIVE':
      return 'This rental is no longer active.';
    default:
      break;
  }

  if (err.status === 404) return 'This rental could not be found.';
  if (err.status === 422) return 'Please check your details and try again.';

  switch (context) {
    case 'convert':
      return 'The rental could not be started. Please try again.';
    case 'complete':
      return 'The rental could not be completed. Please try again.';
    case 'terminate':
      return 'The rental could not be terminated. Please try again.';
    default:
      return generic;
  }
}
