import { describe, expect, it } from 'vitest';

import { createTestDb } from '../helpers/testDb';

/**
 * B14 migration reproducibility (§24/§25). `createTestDb()` applies the ACTUAL
 * migration chain (0000 → current) in order to a fresh in-memory SQLite —
 * exactly what the whole test suite relies on. These assertions make that
 * reproducibility explicit: from an empty database the chain must produce every
 * business table and every security/business-critical index. If a future
 * migration drifts, this fails loudly instead of silently.
 */

const EXPECTED_TABLES = [
  'users',
  'sessions',
  'password_reset_tokens',
  'properties',
  'property_images',
  'rental_requests',
  'rentals',
  'payments',
  'payment_provider_events',
  'notifications',
];

// Indexes that enforce core security / business invariants — not merely lookups.
const EXPECTED_UNIQUE_INDEXES = [
  'users_email_unique',
  'users_phone_unique',
  'sessions_token_hash_unique',
  'password_reset_tokens_token_hash_unique',
  'rentals_one_active_per_property', // one ACTIVE rental per property
  'rentals_rental_request_id_unique', // one rental per request
  'rental_requests_active_unique', // one active request per tenant+property
  'payments_provider_txn_unique', // (provider, providerTransactionId) idempotency
  'payments_tenant_idempotency_unique', // per-tenant Idempotency-Key
  'ppe_provider_event_unique', // webhook event dedup
  'ppe_provider_payload_unique', // webhook payload dedup
  'notifications_user_event_unique', // per-recipient notification dedup
];

function names(db: ReturnType<typeof createTestDb>, type: 'table' | 'index'): Set<string> {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = ?`).all(type) as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

describe('migration chain reproducibility', () => {
  it('builds every business table from an empty database', () => {
    const db = createTestDb();
    const tables = names(db, 'table');
    for (const t of EXPECTED_TABLES) expect(tables.has(t)).toBe(true);
    // The 0008 rebuild's temp table must not survive (it is renamed away).
    expect(tables.has('__new_notifications')).toBe(false);
    db.close();
  });

  it('creates every security/business-critical unique index', () => {
    const db = createTestDb();
    const indexes = names(db, 'index');
    for (const idx of EXPECTED_UNIQUE_INDEXES) expect(indexes.has(idx)).toBe(true);
    db.close();
  });

  it('applies cleanly and repeatably (a second fresh build is identical)', () => {
    const a = createTestDb();
    const b = createTestDb();
    expect([...names(a, 'table')].sort()).toEqual([...names(b, 'table')].sort());
    expect([...names(a, 'index')].sort()).toEqual([...names(b, 'index')].sort());
    a.close();
    b.close();
  });
});
