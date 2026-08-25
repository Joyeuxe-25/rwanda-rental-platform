import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb, now, testId, type TestDb } from '../helpers/testDb';

/**
 * Database architecture (B1) constraint tests.
 *
 * These run against the ACTUAL generated migration applied to an in-memory
 * SQLite database (same engine as Cloudflare D1), verifying real foreign keys,
 * CHECK constraints, and unique / partial-unique indexes — not mocks.
 */

let db: TestDb;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

// --- insert helpers ---------------------------------------------------------

interface UserOverrides {
  id?: string;
  role?: string;
  email?: string;
  phone?: string;
}

function insertUser(overrides: UserOverrides = {}): string {
  const id = overrides.id ?? testId('user');
  const email = overrides.email ?? `${id}@example.rw`;
  const phone = overrides.phone ?? `+25078${Math.floor(1000000 + Math.random() * 8999999)}`;
  db.prepare(
    `INSERT INTO users (id, role, first_name, last_name, email, phone, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, overrides.role ?? 'TENANT', 'Test', 'User', email, phone, 'not-a-real-hash');
  return id;
}

function insertProperty(
  landlordId: string,
  overrides: Partial<Record<string, unknown>> = {},
): string {
  const id = (overrides.id as string) ?? testId('prop');
  db.prepare(
    `INSERT INTO properties (id, landlord_id, title, property_type, monthly_rent, province, district, sector)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    landlordId,
    (overrides.title as string) ?? 'Nice place',
    (overrides.property_type as string) ?? 'APARTMENT',
    (overrides.monthly_rent as number) ?? 150000,
    (overrides.province as string) ?? 'Kigali',
    (overrides.district as string) ?? 'Gasabo',
    (overrides.sector as string) ?? 'Remera',
  );
  return id;
}

function insertRental(
  tenantId: string,
  propertyId: string,
  landlordId: string,
  status = 'ACTIVE',
): string {
  const id = testId('rental');
  db.prepare(
    `INSERT INTO rentals (id, tenant_id, property_id, landlord_id, status, start_date, monthly_rent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, tenantId, propertyId, landlordId, status, now(), 150000);
  return id;
}

// --- tests ------------------------------------------------------------------

describe('users: role constraint', () => {
  it('accepts LANDLORD and TENANT', () => {
    expect(() => insertUser({ role: 'LANDLORD' })).not.toThrow();
    expect(() => insertUser({ role: 'TENANT' })).not.toThrow();
  });

  it('rejects an invalid role (e.g. ADMIN) via CHECK constraint', () => {
    expect(() => insertUser({ role: 'ADMIN' })).toThrow(/CHECK constraint/i);
  });
});

describe('users: unique email', () => {
  it('rejects a duplicate email', () => {
    insertUser({ email: 'dup@example.rw' });
    expect(() => insertUser({ email: 'dup@example.rw' })).toThrow(/UNIQUE constraint/i);
  });
});

describe('properties: ownership foreign key', () => {
  it('accepts a property owned by an existing landlord', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    expect(() => insertProperty(landlord)).not.toThrow();
  });

  it('rejects a property whose landlord does not exist', () => {
    expect(() => insertProperty('nonexistent-landlord')).toThrow(/FOREIGN KEY constraint/i);
  });
});

describe('rentals: one active rental per property', () => {
  it('allows a tenant to hold multiple ACTIVE rentals across different properties', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    const tenant = insertUser({ role: 'TENANT' });
    const propX = insertProperty(landlord);
    const propY = insertProperty(landlord);

    expect(() => insertRental(tenant, propX, landlord, 'ACTIVE')).not.toThrow();
    expect(() => insertRental(tenant, propY, landlord, 'ACTIVE')).not.toThrow();
  });

  it('forbids two ACTIVE rentals on the SAME property', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    const tenantA = insertUser({ role: 'TENANT' });
    const tenantB = insertUser({ role: 'TENANT' });
    const prop = insertProperty(landlord);

    insertRental(tenantA, prop, landlord, 'ACTIVE');
    expect(() => insertRental(tenantB, prop, landlord, 'ACTIVE')).toThrow(/UNIQUE constraint/i);
  });

  it('allows a new ACTIVE rental once the previous one is COMPLETED', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    const tenantA = insertUser({ role: 'TENANT' });
    const tenantB = insertUser({ role: 'TENANT' });
    const prop = insertProperty(landlord);

    const first = insertRental(tenantA, prop, landlord, 'ACTIVE');
    db.prepare(`UPDATE rentals SET status = 'COMPLETED' WHERE id = ?`).run(first);

    expect(() => insertRental(tenantB, prop, landlord, 'ACTIVE')).not.toThrow();
  });
});

describe('payments: belongs to a rental', () => {
  function insertPayment(
    rentalId: string,
    ids: { tenant: string; landlord: string; property: string },
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const id = testId('pay');
    db.prepare(
      `INSERT INTO payments (id, rental_id, tenant_id, landlord_id, property_id, amount, payment_period, provider, provider_transaction_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      rentalId,
      ids.tenant,
      ids.landlord,
      ids.property,
      (overrides.amount as number) ?? 150000,
      (overrides.payment_period as string) ?? '2026-08',
      (overrides.provider as string) ?? 'MTN_MOMO',
      (overrides.provider_transaction_id as string | null) ?? null,
      (overrides.status as string) ?? 'PENDING',
    );
    return id;
  }

  it('accepts a payment referencing a valid rental', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    const tenant = insertUser({ role: 'TENANT' });
    const prop = insertProperty(landlord);
    const rental = insertRental(tenant, prop, landlord, 'ACTIVE');
    expect(() => insertPayment(rental, { tenant, landlord, property: prop })).not.toThrow();
  });

  it('rejects a payment referencing a non-existent rental', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    const tenant = insertUser({ role: 'TENANT' });
    const prop = insertProperty(landlord);
    expect(() => insertPayment('nonexistent-rental', { tenant, landlord, property: prop })).toThrow(
      /FOREIGN KEY constraint/i,
    );
  });

  it('enforces (provider, providerTransactionId) idempotency when the id is present', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    const tenant = insertUser({ role: 'TENANT' });
    const prop = insertProperty(landlord);
    const rental = insertRental(tenant, prop, landlord, 'ACTIVE');
    const ids = { tenant, landlord, property: prop };

    insertPayment(rental, ids, { provider: 'MTN_MOMO', provider_transaction_id: 'TX123' });
    // Same provider + same txn id → duplicate rejected.
    expect(() =>
      insertPayment(rental, ids, { provider: 'MTN_MOMO', provider_transaction_id: 'TX123' }),
    ).toThrow(/UNIQUE constraint/i);
    // Same txn id but a DIFFERENT provider → allowed (ids not globally unique).
    expect(() =>
      insertPayment(rental, ids, { provider: 'AIRTEL_MONEY', provider_transaction_id: 'TX123' }),
    ).not.toThrow();
    // Multiple PENDING payments with NULL txn id → allowed (partial index).
    expect(() => insertPayment(rental, ids, { provider_transaction_id: null })).not.toThrow();
    expect(() => insertPayment(rental, ids, { provider_transaction_id: null })).not.toThrow();
  });

  it('rejects a non-positive payment amount via CHECK constraint', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    const tenant = insertUser({ role: 'TENANT' });
    const prop = insertProperty(landlord);
    const rental = insertRental(tenant, prop, landlord, 'ACTIVE');
    expect(() =>
      insertPayment(rental, { tenant, landlord, property: prop }, { amount: 0 }),
    ).toThrow(/CHECK constraint/i);
  });
});

describe('notifications: belongs to a user', () => {
  function insertNotification(userId: string) {
    const id = testId('notif');
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, userId, 'NEW_RENTAL_REQUEST', 'New request', 'You have a new rental request');
    return id;
  }

  it('accepts a notification referencing an existing user', () => {
    const user = insertUser();
    expect(() => insertNotification(user)).not.toThrow();
  });

  it('rejects a notification referencing a non-existent user', () => {
    expect(() => insertNotification('nonexistent-user')).toThrow(/FOREIGN KEY constraint/i);
  });
});

describe('property_images: cascade + reference', () => {
  it('deletes images when their property is deleted (cascade)', () => {
    const landlord = insertUser({ role: 'LANDLORD' });
    const prop = insertProperty(landlord);
    db.prepare(
      `INSERT INTO property_images (id, property_id, object_key, is_primary) VALUES (?, ?, ?, ?)`,
    ).run(testId('img'), prop, 'properties/x/1.jpg', 1);

    db.prepare(`DELETE FROM properties WHERE id = ?`).run(prop);
    const remaining = db
      .prepare(`SELECT COUNT(*) AS c FROM property_images WHERE property_id = ?`)
      .get(prop) as { c: number };
    expect(remaining.c).toBe(0);
  });
});
