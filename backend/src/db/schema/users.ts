import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt, primaryId, updatedAt } from './_shared';

/**
 * Users — application accounts. MVP has exactly two roles: LANDLORD and TENANT
 * (there is NO admin role).
 *
 * Role: stored as TEXT with a Drizzle `enum` (TS-level safety) AND a DB CHECK
 * constraint (runtime safety) so an invalid role cannot be inserted even via
 * raw SQL.
 *
 * Email: UNIQUE. Phone: UNIQUE — in the Rwandan market a phone number is a
 * primary contact/identity. Normalization (e.g. to E.164 `+2507XXXXXXXX`) is a
 * service-layer concern (B2+); the DB stores whatever canonical form the
 * service writes and enforces uniqueness on it.
 *
 * passwordHash exists as part of the user data model; authentication/hashing is
 * implemented in B2, NOT here.
 */
export const users = sqliteTable(
  'users',
  {
    id: primaryId(),
    role: text('role', { enum: ['LANDLORD', 'TENANT'] }).notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull().unique(),
    phone: text('phone').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    // R2 object key for the profile image (nullable; upload logic is a later phase).
    profileImageKey: text('profile_image_key'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_role_check', sql`${t.role} IN ('LANDLORD', 'TENANT')`),
    // NOTE: email & phone already get UNIQUE indexes from `.unique()` above,
    // which also serve equality lookups — no extra plain index needed for them.
    index('users_role_idx').on(t.role),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
