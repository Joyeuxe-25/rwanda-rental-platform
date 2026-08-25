import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDb } from '../src/db/client';
import { properties, rentals } from '../src/db/schema';
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
 * B7 rental tests — real HTTP path (route → auth → role → validation →
 * controller → service → repository → drizzle/d1 → D1 shim). Fresh DB per test.
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
async function property(env: Bindings, token: string, publish = true): Promise<string> {
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
  if (publish) await patch(`/api/v1/properties/mine/${id}/publish`, {}, env, cookie(token));
  return id;
}
const createReq = (env: Bindings, token: string, propertyId: string) =>
  postJson('/api/v1/rental-requests', { propertyId }, env, cookie(token));
const convert = (env: Bindings, token: string, reqId: string, body: unknown = {}) =>
  postJson(`/api/v1/rentals/from-request/${reqId}`, body, env, cookie(token));
function propStatus(db: TestDb, id: string): string {
  return (db.prepare('SELECT status FROM properties WHERE id = ?').get(id) as { status: string })
    .status;
}
function rentalCount(db: TestDb): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM rentals').get() as { c: number }).c;
}

/** landlord + published property + tenant + an ACCEPTED request. */
async function accepted(env: Bindings) {
  const ll = await landlord(env);
  const pid = await property(env, ll.token);
  const tn = await tenant(env);
  const rr = (await json(await createReq(env, tn.token, pid))).data.rentalRequest;
  await patch(`/api/v1/rental-requests/landlord/${rr.id}/approve`, {}, env, cookie(ll.token));
  return { ll, tn, pid, reqId: rr.id };
}

// --- AUTHORIZATION + CREATION ----------------------------------------------

describe('POST /rentals/from-request/:id', () => {
  it('401 unauth, 403 landlord, 201 tenant; derives identity server-side', async () => {
    const { env, db } = makeTestEnv();
    const { ll, tn, pid, reqId } = await accepted(env);
    expect((await convert(env, '', reqId)).status).toBe(401);
    expect((await convert(env, ll.token, reqId)).status).toBe(403);

    const ok = await convert(env, tn.token, reqId);
    expect(ok.status).toBe(201);
    const rental = (await json(ok)).data.rental;
    expect(rental.status).toBe('ACTIVE');
    expect(rental.propertyId).toBe(pid);
    expect(rental.rentalRequestId).toBe(reqId);
    expect(rental.monthlyRent).toBe(200000); // snapshot from property
    expect(rental.securityDeposit).toBe(400000);
    expect(rental).not.toHaveProperty('tenantId');
    expect(rental.landlord).toMatchObject({ id: ll.user.id });
    // Property becomes OCCUPIED only after a successful ACTIVE rental.
    expect(propStatus(db, pid)).toBe('OCCUPIED');
  });

  it('rejects non-ACCEPTED requests (pending/rejected/cancelled) and nonexistent', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const tn = await tenant(env);

    // pending
    const pending = (await json(await createReq(env, tn.token, pid))).data.rentalRequest;
    expect((await json(await convert(env, tn.token, pending.id))).error.code).toBe(
      'RENTAL_REQUEST_NOT_ACCEPTED',
    );
    // rejected
    await patch(`/api/v1/rental-requests/landlord/${pending.id}/reject`, {}, env, cookie(ll.token));
    expect((await convert(env, tn.token, pending.id)).status).toBe(409);
    // cancelled (fresh property/request)
    const pid2 = await property(env, ll.token);
    const r2 = (await json(await createReq(env, tn.token, pid2))).data.rentalRequest;
    await patch(`/api/v1/rental-requests/mine/${r2.id}/cancel`, {}, env, cookie(tn.token));
    expect((await convert(env, tn.token, r2.id)).status).toBe(409);
    // nonexistent
    expect((await convert(env, tn.token, 'nope')).status).toBe(404);
  });

  it('another tenant cannot convert someone else’s request (404)', async () => {
    const { env } = makeTestEnv();
    const { reqId } = await accepted(env);
    const other = await tenant(env);
    const res = await convert(env, other.token, reqId);
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('RENTAL_REQUEST_NOT_FOUND');
  });

  it('rejects mass-assignment and invalid dates (422); leaves no partial state', async () => {
    const { env, db } = makeTestEnv();
    const { tn, pid, reqId } = await accepted(env);
    for (const body of [
      { tenantId: 'x' },
      { landlordId: 'x' },
      { propertyId: 'x' },
      { status: 'COMPLETED' },
      { monthlyRent: 1 },
      { id: 'x' },
      { startDate: '2026-12-01', endDate: '2026-01-01' }, // end before start
      { startDate: 'not-a-date' },
    ]) {
      const res = await convert(env, tn.token, reqId, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    // No rental created and property still AVAILABLE.
    expect(rentalCount(db)).toBe(0);
    expect(propStatus(db, pid)).toBe('AVAILABLE');
  });

  it('accepts an empty body and optional valid dates', async () => {
    const { env } = makeTestEnv();
    const { tn, reqId } = await accepted(env);
    const res = await convert(env, tn.token, reqId, {
      startDate: '2026-09-01',
      endDate: '2027-09-01',
    });
    expect(res.status).toBe(201);
    const rental = (await json(res)).data.rental;
    expect(rental.startDate.startsWith('2026-09-01')).toBe(true);
    expect(rental.endDate.startsWith('2027-09-01')).toBe(true);
  });
});

// --- DUPLICATION / RACE-SAFETY ---------------------------------------------

describe('duplicate / race safety', () => {
  it('the same request cannot create two rentals (409, single rental)', async () => {
    const { env, db } = makeTestEnv();
    const { tn, reqId } = await accepted(env);
    expect((await convert(env, tn.token, reqId)).status).toBe(201);
    const dup = await convert(env, tn.token, reqId);
    expect(dup.status).toBe(409);
    expect((await json(dup)).error.code).toBe('RENTAL_ALREADY_EXISTS');
    expect(rentalCount(db)).toBe(1);
  });

  it('two accepted requests for the same property → only one ACTIVE rental', async () => {
    const { env, db } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const t1 = await tenant(env);
    const t2 = await tenant(env);
    const r1 = (await json(await createReq(env, t1.token, pid))).data.rentalRequest;
    const r2 = (await json(await createReq(env, t2.token, pid))).data.rentalRequest;
    await patch(`/api/v1/rental-requests/landlord/${r1.id}/approve`, {}, env, cookie(ll.token));
    await patch(`/api/v1/rental-requests/landlord/${r2.id}/approve`, {}, env, cookie(ll.token));

    expect((await convert(env, t1.token, r1.id)).status).toBe(201);
    const second = await convert(env, t2.token, r2.id);
    expect(second.status).toBe(409);
    expect((await json(second)).error.code).toBe('PROPERTY_NOT_AVAILABLE');
    const active = db
      .prepare("SELECT COUNT(*) AS c FROM rentals WHERE property_id = ? AND status = 'ACTIVE'")
      .get(pid) as { c: number };
    expect(active.c).toBe(1);
  });

  it('existing rental remains intact after a failed duplicate conversion', async () => {
    const { env, db } = makeTestEnv();
    const { tn, reqId } = await accepted(env);
    const first = (await json(await convert(env, tn.token, reqId))).data.rental;
    await convert(env, tn.token, reqId); // fails 409
    const got = await get(`/api/v1/rentals/mine/${first.id}`, env, cookie(tn.token));
    expect(got.status).toBe(200);
    expect((await json(got)).data.rental.status).toBe('ACTIVE');
    expect(rentalCount(db)).toBe(1);
  });
});

// --- OWNERSHIP / READ -------------------------------------------------------

describe('ownership and reads', () => {
  it('tenant/landlord list + detail; cross-owner is 404; cross-role is 403', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, reqId } = await accepted(env);
    const rental = (await json(await convert(env, tn.token, reqId))).data.rental;

    // Tenant own list/detail.
    expect(
      (await json(await get('/api/v1/rentals/mine', env, cookie(tn.token)))).data.rentals,
    ).toHaveLength(1);
    expect((await get(`/api/v1/rentals/mine/${rental.id}`, env, cookie(tn.token))).status).toBe(
      200,
    );
    // Landlord own list/detail (tenant identity shown).
    const llList = (await json(await get('/api/v1/rentals/landlord', env, cookie(ll.token)))).data
      .rentals;
    expect(llList).toHaveLength(1);
    expect(llList[0].tenant).toMatchObject({ id: tn.user.id });
    expect(llList[0].tenant).not.toHaveProperty('passwordHash');

    // Cross-owner.
    const otherT = await tenant(env);
    const otherL = await landlord(env);
    expect((await get(`/api/v1/rentals/mine/${rental.id}`, env, cookie(otherT.token))).status).toBe(
      404,
    );
    expect(
      (await get(`/api/v1/rentals/landlord/${rental.id}`, env, cookie(otherL.token))).status,
    ).toBe(404);
    // Cross-role.
    expect((await get('/api/v1/rentals/landlord', env, cookie(tn.token))).status).toBe(403);
    expect((await get('/api/v1/rentals/mine', env, cookie(ll.token))).status).toBe(403);
  });
});

// --- LIFECYCLE --------------------------------------------------------------

describe('lifecycle (complete/terminate)', () => {
  it('landlord completes an active rental → property becomes AVAILABLE; terminal is final', async () => {
    const { env, db } = makeTestEnv();
    const { ll, tn, pid, reqId } = await accepted(env);
    const rental = (await json(await convert(env, tn.token, reqId))).data.rental;
    expect(propStatus(db, pid)).toBe('OCCUPIED');

    const done = await patch(
      `/api/v1/rentals/landlord/${rental.id}/complete`,
      {},
      env,
      cookie(ll.token),
    );
    expect(done.status).toBe(200);
    expect((await json(done)).data.rental.status).toBe('COMPLETED');
    expect(propStatus(db, pid)).toBe('AVAILABLE');

    // Terminal: cannot complete/terminate again.
    expect(
      (await patch(`/api/v1/rentals/landlord/${rental.id}/complete`, {}, env, cookie(ll.token)))
        .status,
    ).toBe(409);
    expect(
      (await patch(`/api/v1/rentals/landlord/${rental.id}/terminate`, {}, env, cookie(ll.token)))
        .status,
    ).toBe(409);
  });

  it('landlord can terminate; tenant cannot; other landlord cannot', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, reqId } = await accepted(env);
    const rental = (await json(await convert(env, tn.token, reqId))).data.rental;
    const otherL = await landlord(env);
    expect(
      (await patch(`/api/v1/rentals/landlord/${rental.id}/terminate`, {}, env, cookie(tn.token)))
        .status,
    ).toBe(403);
    expect(
      (
        await patch(
          `/api/v1/rentals/landlord/${rental.id}/terminate`,
          {},
          env,
          cookie(otherL.token),
        )
      ).status,
    ).toBe(404);
    const ok = await patch(
      `/api/v1/rentals/landlord/${rental.id}/terminate`,
      {},
      env,
      cookie(ll.token),
    );
    expect(ok.status).toBe(200);
    expect((await json(ok)).data.rental.status).toBe('TERMINATED');
  });
});

// --- ATOMICITY: no dangling ACTIVE rental on a failed property update -------

describe('atomicity: rental+property write is all-or-nothing', () => {
  it('A/B/C: a failing property update rolls back the rental insert (no dangling ACTIVE rental)', async () => {
    const { env, db: raw } = makeTestEnv();
    const { ll, tn, pid, reqId } = await accepted(env);
    const orm = getDb(env);

    // Simulate the exact risky sequence — a valid ACTIVE-rental INSERT followed
    // by a property-status UPDATE that FAILS — as ONE atomic D1 batch. The
    // update sets an invalid status, violating the property status CHECK.
    await expect(
      orm.batch([
        orm
          .insert(rentals)
          .values({
            tenantId: tn.user.id,
            propertyId: pid,
            landlordId: ll.user.id,
            rentalRequestId: reqId,
            status: 'ACTIVE',
            startDate: new Date(),
            monthlyRent: 200000,
          })
          .returning(),
        orm
          .update(properties)
          .set({ status: 'NOT_A_REAL_STATUS' as unknown as 'AVAILABLE' })
          .where(eq(properties.id, pid)),
      ]),
    ).rejects.toThrow();

    // B: the ACTIVE rental insert was rolled back (nothing persisted).
    expect(rentalCount(raw)).toBe(0);
    // C: the property is still AVAILABLE (no partial state).
    expect(propStatus(raw, pid)).toBe('AVAILABLE');

    // D: after the rolled-back failure, a real conversion still succeeds…
    const ok = await convert(env, tn.token, reqId);
    expect(ok.status).toBe(201);
    expect((await json(ok)).data.rental.status).toBe('ACTIVE');
    // E: success ⇒ ACTIVE rental + OCCUPIED property.
    expect(rentalCount(raw)).toBe(1);
    expect(propStatus(raw, pid)).toBe('OCCUPIED');
  });

  it('F: duplicate conversion still returns 409 after the atomic fix', async () => {
    const { env, db } = makeTestEnv();
    const { tn, reqId } = await accepted(env);
    expect((await convert(env, tn.token, reqId)).status).toBe(201);
    const dup = await convert(env, tn.token, reqId);
    expect(dup.status).toBe(409);
    expect((await json(dup)).error.code).toBe('RENTAL_ALREADY_EXISTS');
    expect(rentalCount(db)).toBe(1);
  });

  it('invariant holds: no rental is ACTIVE while its property is AVAILABLE', async () => {
    const { env, db } = makeTestEnv();
    const { tn, reqId } = await accepted(env);
    await convert(env, tn.token, reqId);
    // Every ACTIVE rental must have an OCCUPIED property.
    const bad = db
      .prepare(
        `SELECT COUNT(*) AS c FROM rentals r JOIN properties p ON p.id = r.property_id
         WHERE r.status = 'ACTIVE' AND p.status != 'OCCUPIED'`,
      )
      .get() as { c: number };
    expect(bad.c).toBe(0);
  });
});

// --- SECURITY: logs ---------------------------------------------------------

describe('security: rental ops never log secrets', () => {
  afterEach(() => vi.restoreAllMocks());
  it('no session tokens or password hashes in logs', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) =>
        logs.push(a.map(String).join(' ')),
      );
    }
    const { env } = makeTestEnv();
    const { ll, tn, reqId } = await accepted(env);
    const rental = (await json(await convert(env, tn.token, reqId))).data.rental;
    await patch(`/api/v1/rentals/landlord/${rental.id}/complete`, {}, env, cookie(ll.token));
    const blob = logs.join('\n');
    expect(blob).not.toContain('pbkdf2$');
    expect(blob).not.toContain(tn.token);
    expect(blob).not.toContain(ll.token);
  });
});
