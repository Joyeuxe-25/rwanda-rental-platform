import { ApiRequestError } from '@/lib/api';

/**
 * Map a backend profile error to SAFE, user-facing copy (F8). Never surfaces raw
 * backend messages, codes, SQL, or stack traces. Codes verified against B3.
 */
export function profileErrorMessage(err: unknown): string {
  const generic = 'We couldn’t save your changes. Please try again.';
  if (!(err instanceof ApiRequestError)) return generic;

  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.status === 401) return 'Your session has expired. Please sign in again.';
  if (err.status === 403) return 'You do not have permission to make this change.';
  if (err.code === 'PHONE_ALREADY_IN_USE')
    return 'This phone number is already associated with another account.';
  if (err.status === 422) return 'Please check the highlighted fields and try again.';
  return generic;
}
