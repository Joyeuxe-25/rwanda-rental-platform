/**
 * Authentication types mapped from the backend `SafeUser` schema
 * (`backend/openapi.json`). The frontend NEVER handles passwords, session
 * tokens, or reset tokens as state — the backend's HttpOnly `rrp_session` cookie
 * is the only credential.
 */

export type UserRole = 'TENANT' | 'LANDLORD';

/** The authenticated user's safe, public-facing shape (never a secret). */
export interface AuthUser {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileImageKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}
