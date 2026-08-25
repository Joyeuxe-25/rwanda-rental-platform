import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Bindings } from '../src/types';
import {
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
 * B6 rental-request tests. Real HTTP path (route → requireAuth → requireRole →
 * validation → controller → service → repository → drizzle/d1 → D1 shim).
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
async function property(
  env: Bindings,
  token: string,
  { publish = true }: { publish?: boolean } = {},
): Promise<string> {
  const res = await postJson(
    '/api/v1/properties',
    {
      title: 'Rentable',
      description: 'nice',
      propertyType: 'HOUSE',
      monthlyRent: 200000,
      province: 'Kigali',
      district: 'Gasabo',
      sector: 'Remera',
    },
    env,
    cookie(token),
  );
  const id = (await json(res)).data.property.id;
  if (publish) await patch(`/api/v1/properties/mine/${id}/publish`, {}, env, cookie(token));
  return id;
}
function setStatus(db: TestDb, propertyId: string, status: string) {
  db.prepare('UPDATE properties SET status = ? WHERE id = ?').run(status, propertyId);
}
const createReq = (env: Bindings, token: string, propertyId: string, message?: string) =>
  postJson(
    '/api/v1/rental-requests',
    { propertyId, ...(message ? { message } : {}) },
    env,
    cookie(token),
  );

/** Convenience: landlord + published property + tenant + a pending request. */
async function scenario(env: Bindings) {
  const ll = await landlord(env);
  const pid = await property(env, ll.token);
  const tn = await tenant(env);
  const res = await createReq(env, tn.token, pid);
  const req = (await json(res)).data.rentalRequest;
  return { ll, tn, pid, req };
}

// --- AUTHORIZATION + CREATION ----------------------------------------------

describe('POST /rental-requests (create)', () => {
  it('401 unauth, 403 landlord, 201 tenant on published AVAILABLE property', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const tn = await tenant(env);
    expect((await createReq(env, '', pid)).status).toBe(401);
    expect((await createReq(env, ll.token, pid)).status).toBe(403);
    const ok = await createReq(env, tn.token, pid);
    expect(ok.status).toBe(201);
    const rr = (await json(ok)).data.rentalRequest;
    expect(rr.status).toBe('PENDING');
    expect(rr.propertyId).toBe(pid);
    expect(rr).not.toHaveProperty('tenantId'); // safe view
  });

  it('rejects unpublished (409), OCCUPIED (409), UNAVAILABLE (409), nonexistent (404)', async () => {
    const { env, db } = makeTestEnv();
    const ll = await landlord(env);
    const tn = await tenant(env);

    const unpub = await property(env, ll.token, { publish: false });
    expect((await json(await createReq(env, tn.token, unpub))).error.code).toBe(
      'PROPERTY_NOT_PUBLISHED',
    );

    const occ = await property(env, ll.token);
    setStatus(db, occ, 'OCCUPIED');
    expect((await json(await createReq(env, tn.token, occ))).error.code).toBe(
      'PROPERTY_NOT_AVAILABLE',
    );

    const un = await property(env, ll.token);
    setStatus(db, un, 'UNAVAILABLE');
    expect((await json(await createReq(env, tn.token, un))).error.code).toBe(
      'PROPERTY_NOT_AVAILABLE',
    );

    const missing = await createReq(env, tn.token, 'does-not-exist');
    expect(missing.status).toBe(404);
    expect((await json(missing)).error.code).toBe('PROPERTY_NOT_FOUND');
  });

  it('rejects mass-assignment / bad input (422)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const tn = await tenant(env);
    for (const body of [
      { propertyId: pid, tenantId: 'x' },
      { propertyId: pid, landlordId: 'x' },
      { propertyId: pid, status: 'ACCEPTED' },
      { propertyId: pid, id: 'x' },
      { propertyId: pid, nickname: 'x' },
      {}, // missing propertyId
      { propertyId: '' },
    ]) {
      const res = await postJson('/api/v1/rental-requests', body, env, cookie(tn.token));
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
  });

  it('prevents a duplicate active request (409)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const tn = await tenant(env);
    expect((await createReq(env, tn.token, pid)).status).toBe(201);
    const dup = await createReq(env, tn.token, pid);
    expect(dup.status).toBe(409);
    expect((await json(dup)).error.code).toBe('RENTAL_REQUEST_ALREADY_EXISTS');
  });

  it('allows a new request after the previous was cancelled/rejected', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const tn = await tenant(env);
    const r1 = (await json(await createReq(env, tn.token, pid))).data.rentalRequest;
    await patch(`/api/v1/rental-requests/mine/${r1.id}/cancel`, {}, env, cookie(tn.token));
    expect((await createReq(env, tn.token, pid)).status).toBe(201); // allowed again
  });
});

// --- TENANT OWNERSHIP -------------------------------------------------------

describe('tenant read/cancel ownership', () => {
  it('lists only own requests; cannot see another tenant’s request', async () => {
    const { env } = makeTestEnv();
    const { tn, req } = await scenario(env);
    const other = await tenant(env);
    const mine = (await json(await get('/api/v1/rental-requests/mine', env, cookie(tn.token)))).data
      .rentalRequests;
    expect(mine).toHaveLength(1);
    expect(
      (await get(`/api/v1/rental-requests/mine/${req.id}`, env, cookie(tn.token))).status,
    ).toBe(200);
    // Other tenant: empty list + 404 on detail (no existence leak).
    expect(
      (await json(await get('/api/v1/rental-requests/mine', env, cookie(other.token)))).data
        .rentalRequests,
    ).toEqual([]);
    const leak = await get(`/api/v1/rental-requests/mine/${req.id}`, env, cookie(other.token));
    expect(leak.status).toBe(404);
    expect((await json(leak)).error.code).toBe('RENTAL_REQUEST_NOT_FOUND');
  });

  it('cancels own pending; cannot cancel others’; cannot cancel processed', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, pid, req } = await scenario(env);
    const other = await tenant(env);
    // Another tenant cannot cancel → 404.
    expect(
      (await patch(`/api/v1/rental-requests/mine/${req.id}/cancel`, {}, env, cookie(other.token)))
        .status,
    ).toBe(404);
    // Owner cancels → 200, status CANCELLED.
    const ok = await patch(
      `/api/v1/rental-requests/mine/${req.id}/cancel`,
      {},
      env,
      cookie(tn.token),
    );
    expect(ok.status).toBe(200);
    expect((await json(ok)).data.rentalRequest.status).toBe('CANCELLED');

    // A fresh approved request cannot be cancelled.
    const r2 = (await json(await createReq(env, tn.token, pid))).data.rentalRequest;
    await patch(`/api/v1/rental-requests/landlord/${r2.id}/approve`, {}, env, cookie(ll.token));
    const cantCancel = await patch(
      `/api/v1/rental-requests/mine/${r2.id}/cancel`,
      {},
      env,
      cookie(tn.token),
    );
    expect(cantCancel.status).toBe(409);
    expect((await json(cantCancel)).error.code).toBe('RENTAL_REQUEST_CANNOT_BE_CANCELLED');
  });
});

// --- LANDLORD OWNERSHIP + APPROVE/REJECT -----------------------------------

describe('landlord read/approve/reject', () => {
  it('lists/sees requests for owned properties only', async () => {
    const { env } = makeTestEnv();
    const { ll, req } = await scenario(env);
    const otherLl = await landlord(env);
    const list = (await json(await get('/api/v1/rental-requests/landlord', env, cookie(ll.token))))
      .data.rentalRequests;
    expect(list).toHaveLength(1);
    expect(list[0].tenant).toMatchObject({ id: expect.any(String), firstName: expect.any(String) });
    expect(list[0].tenant).not.toHaveProperty('passwordHash');
    // Owner detail ok; other landlord → 404 (list empty).
    expect(
      (await get(`/api/v1/rental-requests/landlord/${req.id}`, env, cookie(ll.token))).status,
    ).toBe(200);
    expect(
      (await json(await get('/api/v1/rental-requests/landlord', env, cookie(otherLl.token)))).data
        .rentalRequests,
    ).toEqual([]);
    expect(
      (await get(`/api/v1/rental-requests/landlord/${req.id}`, env, cookie(otherLl.token))).status,
    ).toBe(404);
  });

  it('approves a pending request; tenant/other-landlord cannot; re-approve fails', async () => {
    const { env, db } = makeTestEnv();
    const { ll, tn, req } = await scenario(env);
    const otherLl = await landlord(env);
    expect(
      (await patch(`/api/v1/rental-requests/landlord/${req.id}/approve`, {}, env, cookie(tn.token)))
        .status,
    ).toBe(403);
    expect(
      (
        await patch(
          `/api/v1/rental-requests/landlord/${req.id}/approve`,
          {},
          env,
          cookie(otherLl.token),
        )
      ).status,
    ).toBe(404);

    const ok = await patch(
      `/api/v1/rental-requests/landlord/${req.id}/approve`,
      {},
      env,
      cookie(ll.token),
    );
    expect(ok.status).toBe(200);
    expect((await json(ok)).data.rentalRequest.status).toBe('ACCEPTED');

    // Second transition fails.
    const again = await patch(
      `/api/v1/rental-requests/landlord/${req.id}/approve`,
      {},
      env,
      cookie(ll.token),
    );
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe('RENTAL_REQUEST_ALREADY_PROCESSED');

    // B6 side-effect guarantees: no rental/payment, property unchanged.
    // (B12 adds notifications to these flows, so a notification count is no
    // longer expected to be zero — see tests/notifications.test.ts.)
    const rentals = db.prepare('SELECT COUNT(*) AS c FROM rentals').get() as { c: number };
    const payments = db.prepare('SELECT COUNT(*) AS c FROM payments').get() as { c: number };
    expect(rentals.c).toBe(0);
    expect(payments.c).toBe(0);
    const prop = db.prepare('SELECT status FROM properties WHERE id = ?').get(req.propertyId) as {
      status: string;
    };
    expect(prop.status).toBe('AVAILABLE');
  });

  it('rejects a pending request; cannot reject a processed one', async () => {
    const { env } = makeTestEnv();
    const { ll, req } = await scenario(env);
    const ok = await patch(
      `/api/v1/rental-requests/landlord/${req.id}/reject`,
      {},
      env,
      cookie(ll.token),
    );
    expect(ok.status).toBe(200);
    expect((await json(ok)).data.rentalRequest.status).toBe('REJECTED');
    const again = await patch(
      `/api/v1/rental-requests/landlord/${req.id}/reject`,
      {},
      env,
      cookie(ll.token),
    );
    expect(again.status).toBe(409);
  });

  it('cannot approve a rejected/cancelled request or when property became unavailable', async () => {
    const { env, db } = makeTestEnv();
    // rejected → cannot approve
    const s1 = await scenario(env);
    await patch(
      `/api/v1/rental-requests/landlord/${s1.req.id}/reject`,
      {},
      env,
      cookie(s1.ll.token),
    );
    expect(
      (
        await patch(
          `/api/v1/rental-requests/landlord/${s1.req.id}/approve`,
          {},
          env,
          cookie(s1.ll.token),
        )
      ).status,
    ).toBe(409);

    // property became OCCUPIED before approval → conflict
    const s2 = await scenario(env);
    setStatus(db, s2.pid, 'OCCUPIED');
    const res = await patch(
      `/api/v1/rental-requests/landlord/${s2.req.id}/approve`,
      {},
      env,
      cookie(s2.ll.token),
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('PROPERTY_NOT_AVAILABLE');
  });
});

// --- CROSS-ROLE + SECURITY --------------------------------------------------

describe('cross-role access and state persistence', () => {
  it('tenant cannot hit landlord endpoints and vice-versa', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, req } = await scenario(env);
    expect((await get('/api/v1/rental-requests/landlord', env, cookie(tn.token))).status).toBe(403);
    expect(
      (await get(`/api/v1/rental-requests/landlord/${req.id}`, env, cookie(tn.token))).status,
    ).toBe(403);
    expect((await get('/api/v1/rental-requests/mine', env, cookie(ll.token))).status).toBe(403);
    expect(
      (await patch(`/api/v1/rental-requests/mine/${req.id}/cancel`, {}, env, cookie(ll.token)))
        .status,
    ).toBe(403);
  });

  it('processed states are terminal and never leak secrets', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, req } = await scenario(env);
    const ok = await patch(
      `/api/v1/rental-requests/landlord/${req.id}/approve`,
      {},
      env,
      cookie(ll.token),
    );
    const raw = await ok.text();
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain('tokenHash');
    // Still ACCEPTED when re-read by the tenant.
    const reread = await get(`/api/v1/rental-requests/mine/${req.id}`, env, cookie(tn.token));
    expect((await json(reread)).data.rentalRequest.status).toBe('ACCEPTED');
  });
});

describe('security: rental-request ops never log secrets', () => {
  afterEach(() => vi.restoreAllMocks());
  it('no session tokens or password hashes in logs', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) =>
        logs.push(a.map(String).join(' ')),
      );
    }
    const { env } = makeTestEnv();
    const { ll, tn, req } = await scenario(env);
    await patch(`/api/v1/rental-requests/landlord/${req.id}/approve`, {}, env, cookie(ll.token));
    const blob = logs.join('\n');
    expect(blob).not.toContain('pbkdf2$');
    expect(blob).not.toContain(tn.token);
    expect(blob).not.toContain(ll.token);
  });
});
