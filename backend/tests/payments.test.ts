import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDb } from '../src/db/client';
import * as paymentService from '../src/services/payment.service';
import type { Bindings } from '../src/types';
import {
  app,
  cookie,
  get,
  getSetCookie,
  makeTestEnv,
  postJson,
  sendJson,
  validRegistration,
} from './helpers/app';
import type { TestDb } from './helpers/testDb';

/**
 * B8 payment-infrastructure tests. Real HTTP path (route → auth → role →
 * validation → controller → service → repository → drizzle/d1 → D1 shim), plus
 * direct calls to the INTERNAL status service (no HTTP endpoint exists for it).
 */
async function json(res: Response): Promise<any> {
  return res.json();
}
const patch = (p: string, b: unknown, env: Bindings, c?: string) => sendJson('PATCH', p, b, env, c);

let seq = 0;
async function landlord(env: Bindings) {
  seq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'LANDLORD', email: `ll${seq}@example.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function tenant(env: Bindings) {
  seq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'TENANT', email: `tn${seq}@example.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function property(env: Bindings, token: string): Promise<string> {
  const res = await postJson(
    '/api/v1/properties',
    {
      title: 'Rentable',
      description: 'nice',
      propertyType: 'HOUSE',
      monthlyRent: 200000,
      securityDeposit: 400000,
      province: 'Kigali',
      district: 'Gasabo',
      sector: 'Remera',
    },
    env,
    cookie(token),
  );
  const id = (await json(res)).data.property.id;
  await patch(`/api/v1/properties/mine/${id}/publish`, {}, env, cookie(token));
  return id;
}

/** Create a fully ACTIVE rental via the B6/B7 flow. monthlyRent = 200000. */
async function activeRental(env: Bindings) {
  const ll = await landlord(env);
  const pid = await property(env, ll.token);
  const tn = await tenant(env);
  const rr = (
    await json(
      await postJson('/api/v1/rental-requests', { propertyId: pid }, env, cookie(tn.token)),
    )
  ).data.rentalRequest;
  await patch(`/api/v1/rental-requests/landlord/${rr.id}/approve`, {}, env, cookie(ll.token));
  const rental = (
    await json(await postJson(`/api/v1/rentals/from-request/${rr.id}`, {}, env, cookie(tn.token)))
  ).data.rental;
  return { ll, tn, pid, rentalId: rental.id as string, monthlyRent: 200000 };
}

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `idem-key-${keyCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/** POST a payment with an optional Idempotency-Key header. */
async function createPayment(
  env: Bindings,
  token: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Cookie'] = cookie(token);
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return app.request(
    '/api/v1/payments',
    { method: 'POST', headers, body: JSON.stringify(body) },
    env,
  );
}
const validBody = (rentalId: string, over: Record<string, unknown> = {}) => ({
  rentalId,
  amount: 200000,
  paymentPeriod: '2026-08',
  provider: 'MTN_MOMO',
  ...over,
});
function paymentCountForKey(db: TestDb, key: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS c FROM payments WHERE idempotency_key = ?').get(key) as {
      c: number;
    }
  ).c;
}

// --- AUTHORIZATION + CREATION ----------------------------------------------

describe('POST /payments (create intent)', () => {
  it('401 unauth, 403 landlord, 201 tenant → PENDING', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, rentalId } = await activeRental(env);
    expect((await createPayment(env, '', validBody(rentalId), newKey())).status).toBe(401);
    expect((await createPayment(env, ll.token, validBody(rentalId), newKey())).status).toBe(403);

    const ok = await createPayment(env, tn.token, validBody(rentalId), newKey());
    expect(ok.status).toBe(201);
    const p = (await json(ok)).data.payment;
    expect(p.status).toBe('PENDING');
    expect(p.rentalId).toBe(rentalId);
    expect(p.currency).toBe('RWF');
    expect(p.providerTransactionId).toBeNull(); // never fabricated
    expect(p.completedAt).toBeNull();
    expect(p).not.toHaveProperty('idempotencyKey');
    expect(p).not.toHaveProperty('tenantId');
    expect(p).not.toHaveProperty('landlordId');
  });

  it('requires an Idempotency-Key header (400)', async () => {
    const { env } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const res = await createPayment(env, tn.token, validBody(rentalId)); // no key
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects nonexistent / other-tenant rentals (404) and terminal rentals (409)', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, rentalId } = await activeRental(env);

    expect((await createPayment(env, tn.token, validBody('nope'), newKey())).status).toBe(404);

    const otherT = await tenant(env);
    const foreign = await createPayment(env, otherT.token, validBody(rentalId), newKey());
    expect(foreign.status).toBe(404);
    expect((await json(foreign)).error.code).toBe('RENTAL_NOT_FOUND');

    // Complete the rental → no longer payable.
    const rental = (await json(await get('/api/v1/rentals/mine', env, cookie(tn.token)))).data
      .rentals[0];
    await patch(`/api/v1/rentals/landlord/${rental.id}/complete`, {}, env, cookie(ll.token));
    const res = await createPayment(env, tn.token, validBody(rentalId), newKey());
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('RENTAL_NOT_PAYABLE');
  });

  it('validates amount, period, provider, and rejects mass-assignment (422)', async () => {
    const { env } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const bad: Record<string, unknown>[] = [
      { amount: 0 },
      { amount: -5 },
      { amount: 100.5 },
      { amount: 200001 }, // exceeds monthly rent (200000)
      { provider: 'PAYPAL' },
      { paymentPeriod: '2026-13' },
      { paymentPeriod: 'August' },
      { currency: 'USD' }, // server-controlled
      { tenantId: 'x' },
      { landlordId: 'x' },
      { propertyId: 'x' },
      { status: 'SUCCESSFUL' },
      { providerTransactionId: 'x' },
      { completedAt: 1 },
      { id: 'x' },
      { idempotencyKey: 'x' }, // header is authoritative
      { nickname: 'x' },
    ];
    for (const over of bad) {
      const res = await createPayment(env, tn.token, validBody(rentalId, over), newKey());
      expect([422, 409], JSON.stringify(over)).toContain(res.status);
      expect(res.status, JSON.stringify(over)).not.toBe(201);
    }
    // Partial payment (below rent) is allowed.
    expect(
      (await createPayment(env, tn.token, validBody(rentalId, { amount: 100000 }), newKey()))
        .status,
    ).toBe(201);
  });
});

// --- IDEMPOTENCY ------------------------------------------------------------

describe('idempotency', () => {
  it('same key returns the SAME payment and creates no duplicate', async () => {
    const { env, db } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const key = newKey();
    const first = await createPayment(env, tn.token, validBody(rentalId), key);
    const second = await createPayment(env, tn.token, validBody(rentalId), key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200); // idempotent replay
    const p1 = (await json(first)).data.payment;
    const p2 = (await json(second)).data.payment;
    expect(p2.id).toBe(p1.id);
    expect(paymentCountForKey(db, key)).toBe(1);
  });

  it('same key with different params → 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const { env, db } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const key = newKey();
    await createPayment(env, tn.token, validBody(rentalId), key);
    const res = await createPayment(env, tn.token, validBody(rentalId, { amount: 150000 }), key);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(paymentCountForKey(db, key)).toBe(1);
  });

  it('concurrent duplicates with the same key persist only ONE payment', async () => {
    const { env, db } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const key = newKey();
    const [a, b] = await Promise.all([
      createPayment(env, tn.token, validBody(rentalId), key),
      createPayment(env, tn.token, validBody(rentalId), key),
    ]);
    const ids = [(await json(a)).data.payment.id, (await json(b)).data.payment.id];
    expect(ids[0]).toBe(ids[1]); // same payment returned to both
    expect(paymentCountForKey(db, key)).toBe(1); // DB unique index protected it
    expect([a.status, b.status].sort()).toEqual([200, 201]);
  });
});

// --- HISTORY / OWNERSHIP ----------------------------------------------------

describe('payment history & ownership', () => {
  it('tenant/landlord see own; cross-owner → 404; cross-role → 403', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, rentalId } = await activeRental(env);
    const payment = (await json(await createPayment(env, tn.token, validBody(rentalId), newKey())))
      .data.payment;

    // Tenant own.
    expect(
      (await json(await get('/api/v1/payments/mine', env, cookie(tn.token)))).data.payments,
    ).toHaveLength(1);
    expect((await get(`/api/v1/payments/mine/${payment.id}`, env, cookie(tn.token))).status).toBe(
      200,
    );
    // Landlord own (tenant identity shown, no secrets).
    const llList = (await json(await get('/api/v1/payments/landlord', env, cookie(ll.token)))).data
      .payments;
    expect(llList).toHaveLength(1);
    expect(llList[0].tenant).toMatchObject({ id: tn.user.id });
    expect(llList[0].tenant).not.toHaveProperty('passwordHash');
    expect(
      (await get(`/api/v1/payments/landlord/${payment.id}`, env, cookie(ll.token))).status,
    ).toBe(200);

    // Cross-owner → 404.
    const otherT = await tenant(env);
    const otherL = await landlord(env);
    expect(
      (await get(`/api/v1/payments/mine/${payment.id}`, env, cookie(otherT.token))).status,
    ).toBe(404);
    expect(
      (await get(`/api/v1/payments/landlord/${payment.id}`, env, cookie(otherL.token))).status,
    ).toBe(404);
    // Cross-role.
    expect((await get('/api/v1/payments/landlord', env, cookie(tn.token))).status).toBe(403);
    expect((await get('/api/v1/payments/mine', env, cookie(ll.token))).status).toBe(403);
  });

  it('derives tenant/landlord/property from the rental (server-side)', async () => {
    const { env, db } = makeTestEnv();
    const { ll, tn, pid, rentalId } = await activeRental(env);
    const payment = (await json(await createPayment(env, tn.token, validBody(rentalId), newKey())))
      .data.payment;
    const row = db
      .prepare('SELECT tenant_id, landlord_id, property_id, rental_id FROM payments WHERE id = ?')
      .get(payment.id) as Record<string, string>;
    expect(row.tenant_id).toBe(tn.user.id);
    expect(row.landlord_id).toBe(ll.user.id);
    expect(row.property_id).toBe(pid);
    expect(row.rental_id).toBe(rentalId);
  });
});

// --- STATUS MACHINE (internal service; no HTTP mutation) --------------------

describe('payment status machine (internal only)', () => {
  it('there is NO client endpoint to change status', async () => {
    const { env } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const payment = (await json(await createPayment(env, tn.token, validBody(rentalId), newKey())))
      .data.payment;
    // No PATCH /payments/:id route exists → 404 route-not-found.
    const res = await patch(
      `/api/v1/payments/${payment.id}`,
      { status: 'SUCCESSFUL' },
      env,
      cookie(tn.token),
    );
    expect(res.status).toBe(404);
  });

  it('PENDING → each terminal state via the internal service; SUCCESSFUL sets completedAt', async () => {
    for (const target of ['SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED'] as const) {
      const { env } = makeTestEnv();
      const { tn, rentalId } = await activeRental(env);
      const payment = (
        await json(await createPayment(env, tn.token, validBody(rentalId), newKey()))
      ).data.payment;
      const updated = await paymentService.applyProviderStatus(getDb(env), payment.id, target);
      expect(updated.status).toBe(target);
      if (target === 'SUCCESSFUL') expect(updated.completedAt).not.toBeNull();
      else expect(updated.completedAt).toBeNull();
    }
  });

  it('terminal states are final; repeated same terminal is idempotent', async () => {
    const { env } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const payment = (await json(await createPayment(env, tn.token, validBody(rentalId), newKey())))
      .data.payment;
    const db = getDb(env);
    const done = await paymentService.applyProviderStatus(db, payment.id, 'SUCCESSFUL');
    const firstCompletedAt = done.completedAt;

    // Different terminal target → rejected.
    await expect(paymentService.applyProviderStatus(db, payment.id, 'FAILED')).rejects.toThrow();
    // Repeat SUCCESSFUL → idempotent, completedAt unchanged.
    const again = await paymentService.applyProviderStatus(db, payment.id, 'SUCCESSFUL');
    expect(again.status).toBe('SUCCESSFUL');
    expect(again.completedAt?.getTime()).toBe(firstCompletedAt?.getTime());
  });
});

// --- SECURITY ---------------------------------------------------------------

describe('security: no secrets or idempotency keys leaked', () => {
  afterEach(() => vi.restoreAllMocks());
  it('responses omit hashes/tokens/idempotency keys; logs omit secrets', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) =>
        logs.push(a.map(String).join(' ')),
      );
    }
    const { env } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const key = newKey();
    const res = await createPayment(env, tn.token, validBody(rentalId), key);
    const raw = await res.text();
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain('tokenHash');
    expect(raw).not.toContain(key); // idempotency key never returned

    const blob = logs.join('\n');
    expect(blob).not.toContain('pbkdf2$');
    expect(blob).not.toContain(tn.token);
    expect(blob).not.toContain(key); // idempotency key never logged
  });
});
