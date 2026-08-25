import { eq, inArray } from 'drizzle-orm';

import type { Database } from '../db/client';
import { users, type NewUser, type User } from '../db/schema';
import type { SafeUser } from '../types';

/**
 * User data-access. Repositories own all Drizzle/D1 queries; services depend on
 * these functions rather than touching the ORM directly.
 */

export async function findUserByEmail(db: Database, email: string): Promise<User | undefined> {
  return db.select().from(users).where(eq(users.email, email)).get();
}

export async function findUserByPhone(db: Database, phone: string): Promise<User | undefined> {
  return db.select().from(users).where(eq(users.phone, phone)).get();
}

/** Batch-load users by id (B17 discovery — avoids N+1 landlord lookups). */
export async function findManyByIds(db: Database, ids: string[]): Promise<User[]> {
  if (ids.length === 0) return [];
  return db.select().from(users).where(inArray(users.id, ids)).all();
}

export async function findUserById(db: Database, id: string): Promise<User | undefined> {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export async function insertUser(db: Database, values: NewUser): Promise<User> {
  const [row] = await db.insert(users).values(values).returning();
  return row!;
}

export async function updateUserPasswordHash(
  db: Database,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
}

/** Strip sensitive fields (password_hash) and serialize timestamps for the API. */
export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    profileImageKey: user.profileImageKey,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Update only the explicitly-allowed profile columns for a user. Callers MUST
 * pass a pre-constructed object of allowed fields (never a raw request body).
 * Returns the updated row. `updatedAt` refreshes automatically (schema
 * `$onUpdateFn`).
 */
export async function updateUserProfile(
  db: Database,
  userId: string,
  fields: Partial<Pick<User, 'firstName' | 'lastName' | 'phone'>>,
): Promise<User> {
  const [row] = await db.update(users).set(fields).where(eq(users.id, userId)).returning();
  return row!;
}
