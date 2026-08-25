import { ApiRequestError } from '@/lib/api';

type AuthContextName = 'login' | 'register' | 'change' | 'reset' | 'generic';

/**
 * Map an error to a SAFE, user-facing message. Never surfaces raw backend
 * messages, codes, SQL, or stack traces; never reveals whether an email exists.
 */
export function authErrorMessage(err: unknown, context: AuthContextName): string {
  const generic = 'Something went wrong. Please try again.';
  if (!(err instanceof ApiRequestError)) return generic;

  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.status === 422) return 'Please check the highlighted fields and try again.';

  switch (context) {
    case 'login':
      if (err.status === 401) return 'Invalid email or password.';
      return generic;
    case 'register':
      if (err.code === 'AUTH_EMAIL_EXISTS') return 'An account with this email already exists.';
      if (err.code === 'AUTH_PHONE_EXISTS')
        return 'An account with this phone number already exists.';
      return generic;
    case 'change':
      if (err.code === 'AUTH_PASSWORD_INVALID' || err.status === 401)
        return 'Your current password is incorrect.';
      return generic;
    case 'reset':
      if (err.code === 'AUTH_PASSWORD_RESET_INVALID' || err.code === 'AUTH_PASSWORD_RESET_EXPIRED')
        return 'This reset link is invalid or has expired. Please request a new one.';
      return generic;
    default:
      return generic;
  }
}
