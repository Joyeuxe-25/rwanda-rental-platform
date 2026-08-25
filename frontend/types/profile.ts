/**
 * Profile types (F8), mapped from the approved backend B3 contract. The
 * authenticated user's full shape is the existing `AuthUser` (the backend
 * SafeUser). Only three fields are editable here — email and role are immutable
 * in B3 (no verification / no role-management API), and are never sent.
 */

/** The ONLY fields a client may send to `PATCH /users/me` (B3 strict schema). */
export interface ProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
}
