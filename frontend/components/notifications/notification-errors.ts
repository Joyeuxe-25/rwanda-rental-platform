import { ApiRequestError } from '@/lib/api';

/**
 * Map a backend error to SAFE, user-facing copy (F7). Never surfaces raw backend
 * messages, codes, SQL, or internal payloads. `401` is handled by the auth system
 * (RequireAuth redirects), so it should not normally reach here.
 */
export function notificationErrorMessage(err: unknown): string {
  const generic = 'We couldn’t load your notifications. Please try again.';
  if (!(err instanceof ApiRequestError)) return generic;

  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.status === 401) return 'Your session has expired. Please sign in again.';
  if (err.status === 403) return 'You do not have access to these notifications.';
  if (err.code === 'NOTIFICATION_NOT_FOUND' || err.status === 404)
    return 'This notification could not be found.';
  if (err.code === 'NOTIFICATION_INVALID_QUERY' || err.status === 422)
    return 'Those filters aren’t valid. Try clearing them.';
  return generic;
}
