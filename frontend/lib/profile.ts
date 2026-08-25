import { api } from '@/lib/api';
import type { AuthUser } from '@/types/auth';
import type { ProfileUpdateInput } from '@/types/profile';

/**
 * Profile data access (F8). Reuses the F0 API client (cookie-credentialed,
 * envelope-aware) — NO second HTTP client, NO JWT/Bearer, NO token storage.
 * Profile data is private, so the read uses `no-store`.
 *
 * Integrates the approved B3 endpoints under `/api/v1/users`.
 */

/** GET /users/me → the authenticated user's own profile (SafeUser). */
export async function getMyProfile(): Promise<AuthUser> {
  const data = await api.get<{ user: AuthUser }>('/users/me', { cache: 'no-store' });
  return data.user;
}

/**
 * PATCH /users/me → the updated profile. Send ONLY the changed editable fields
 * (`firstName`/`lastName`/`phone`); the backend rejects any other key (role,
 * email, id, …) with 422. Identity is derived from the session, never the body.
 */
export async function updateMyProfile(input: ProfileUpdateInput): Promise<AuthUser> {
  const data = await api.patch<{ user: AuthUser }>('/users/me', input);
  return data.user;
}
