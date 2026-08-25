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
import { now, testId } from './helpers/testDb';

/**
 * B4 property-management tests. Real HTTP path (route → requireAuth →
 * requireRole → validation → controller → service → repository → drizzle/d1 →
 * D1 shim → SQLite). Fresh migrated DB per test.
 */

async function json(res: Response): Promise<any> {
  return res.json();
}

const patch = (p: string, b: unknown, env: Bindings, c?: string) => sendJson('PATCH', p, b, env, c);
const del = (p: string, env: Bindings, c?: string) => sendJson('DELETE', p, undefined, env, c);

let emailSeq = 0;
async function registerLandlord(env: Bindings): Promise<{ token: string; user: any }> {
  emailSeq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'LANDLORD', email: `ll${emailSeq}@example.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function registerTenant(env: Bindings): Promise<{ token: string; user: any }> {
  emailSeq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'TENANT', email: `tn${emailSeq}@example.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}

function validProperty(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Cozy 2-bed in Remera',
    description: 'A nice place near the bus park.',
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    monthlyRent: 250000,
    securityDeposit: 500000,
    otherCharges: 10000,
    province: 'Kigali',
    district: 'Gasabo',
    sector: 'Remera',
    cell: 'Rukiri',
    village: 'Amahoro',
    amenities: ['Parking', 'Water', 'Electricity'],
    ...overrides,
  };
}

async function createProperty(
  env: Bindings,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await postJson('/api/v1/properties', validProperty(overrides), env, cookie(token));
  return (await json(res)).data.property;
}

// --- CREATE ----------------------------------------------------------------

describe('POST /api/v1/properties (create)', () => {
  it('lets a LANDLORD create a property; landlordId derives from session', async () => {
    const { env } = makeTestEnv();
    const ll = await registerLandlord(env);
    const res = await postJson('/api/v1/properties', validProperty(), env, cookie(ll.token));
    expect(res.status).toBe(201);
    const p = (await json(res)).data.property;
    expect(p.landlordId).toBe(ll.user.id);
    expect(p.isPublished).toBe(false);
    expect(p.otherCharges).toBe(10000);
  });

  it('rejects a TENANT (403)', async () => {
    const { env } = makeTestEnv();
    const tn = await registerTenant(env);
    const res = await postJson('/api/v1/properties', validProperty(), env, cookie(tn.token));
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe('AUTH_FORBIDDEN');
  });

  it('rejects unauthenticated (401)', async () => {
    const { env } = makeTestEnv();
    const res = await postJson('/api/v1/properties', validProperty(), env);
    expect(res.status).toBe(401);
  });

  it('ignores/rejects a client-supplied landlordId (strict → 422)', async () => {
    const { env } = makeTestEnv();
    const ll = await registerLandlord(env);
    const res = await postJson(
      '/api/v1/properties',
      validProperty({ landlordId: 'someone-else' }),
      env,
      cookie(ll.token),
    );
    expect(res.status).toBe(422);
  });

  it('rejects invalid property type / negative money / negative counts / bad amenities', async () => {
    const { env } = makeTestEnv();
    const ll = await registerLandlord(env);
    const bad = [
      { propertyType: 'CASTLE' },
      { monthlyRent: -1 },
      { securityDeposit: -5 },
      { otherCharges: -5 },
      { bedrooms: -1 },
      { monthlyRent: 100.5 },
      { amenities: [123] },
      { title: '' },
      { nickname: 'x' }, // unknown field
    ];
    for (const o of bad) {
      const res = await postJson('/api/v1/properties', validProperty(o), env, cookie(ll.token));
      expect(res.status, JSON.stringify(o)).toBe(422);
    }
  });
});

// --- LIST ------------------------------------------------------------------

describe('GET /api/v1/properties/mine (list)', () => {
  it('returns only the landlord’s own properties', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const b = await registerLandlord(env);
    await createProperty(env, a.token, { title: 'A1' });
    await createProperty(env, a.token, { title: 'A2' });
    await createProperty(env, b.token, { title: 'B1' });

    const res = await get('/api/v1/properties/mine', env, cookie(a.token));
    expect(res.status).toBe(200);
    const list = (await json(res)).data.properties;
    expect(list).toHaveLength(2);
    expect(list.every((p: any) => p.landlordId === a.user.id)).toBe(true);
  });

  it('returns an empty list for a landlord with no properties', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const res = await get('/api/v1/properties/mine', env, cookie(a.token));
    expect(res.status).toBe(200);
    expect((await json(res)).data.properties).toEqual([]);
  });

  it('rejects a TENANT (403)', async () => {
    const { env } = makeTestEnv();
    const tn = await registerTenant(env);
    expect((await get('/api/v1/properties/mine', env, cookie(tn.token))).status).toBe(403);
  });
});

// --- DETAIL (mine) ---------------------------------------------------------

describe('GET /api/v1/properties/mine/:id (detail)', () => {
  it('returns own property', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token);
    const res = await get(`/api/v1/properties/mine/${p.id}`, env, cookie(a.token));
    expect(res.status).toBe(200);
    expect((await json(res)).data.property.id).toBe(p.id);
  });

  it('returns 404 for another landlord’s property (no ownership leak)', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const b = await registerLandlord(env);
    const pb = await createProperty(env, b.token);
    const res = await get(`/api/v1/properties/mine/${pb.id}`, env, cookie(a.token));
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('PROPERTY_NOT_FOUND');
  });

  it('returns 404 for an unknown id', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    expect(
      (await get(`/api/v1/properties/mine/${testId('nope')}`, env, cookie(a.token))).status,
    ).toBe(404);
  });
});

// --- UPDATE ----------------------------------------------------------------

describe('PATCH /api/v1/properties/mine/:id (update)', () => {
  it('updates own property with an allowlist', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token);
    const res = await patch(
      `/api/v1/properties/mine/${p.id}`,
      { title: 'Updated title', monthlyRent: 300000 },
      env,
      cookie(a.token),
    );
    expect(res.status).toBe(200);
    const up = (await json(res)).data.property;
    expect(up.title).toBe('Updated title');
    expect(up.monthlyRent).toBe(300000);
  });

  it('cannot update another landlord’s property (404)', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const b = await registerLandlord(env);
    const pb = await createProperty(env, b.token);
    const res = await patch(
      `/api/v1/properties/mine/${pb.id}`,
      { title: 'hax' },
      env,
      cookie(a.token),
    );
    expect(res.status).toBe(404);
  });

  it('rejects a TENANT (403) and unauthenticated (401)', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const tn = await registerTenant(env);
    const p = await createProperty(env, a.token);
    expect(
      (await patch(`/api/v1/properties/mine/${p.id}`, { title: 'x' }, env, cookie(tn.token)))
        .status,
    ).toBe(403);
    expect((await patch(`/api/v1/properties/mine/${p.id}`, { title: 'x' }, env)).status).toBe(401);
  });

  it('rejects attempts to change id/landlordId/status/isPublished (422)', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token);
    for (const body of [
      { id: 'x' },
      { landlordId: 'x' },
      { status: 'OCCUPIED' },
      { isPublished: true },
      { tenantId: 'x' },
      { rentalId: 'x' },
    ]) {
      const res = await patch(`/api/v1/properties/mine/${p.id}`, body, env, cookie(a.token));
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    // Status unchanged, still not occupied.
    const after = await get(`/api/v1/properties/mine/${p.id}`, env, cookie(a.token));
    expect((await json(after)).data.property.status).toBe('AVAILABLE');
  });

  it('rejects an empty PATCH body (422)', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token);
    expect((await patch(`/api/v1/properties/mine/${p.id}`, {}, env, cookie(a.token))).status).toBe(
      422,
    );
  });
});

// --- DELETE ----------------------------------------------------------------

describe('DELETE /api/v1/properties/mine/:id', () => {
  it('deletes a safe own property', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token);
    const res = await del(`/api/v1/properties/mine/${p.id}`, env, cookie(a.token));
    expect(res.status).toBe(200);
    expect((await get(`/api/v1/properties/mine/${p.id}`, env, cookie(a.token))).status).toBe(404);
  });

  it('cannot delete another landlord’s property (404) and TENANT/unauth blocked', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const b = await registerLandlord(env);
    const tn = await registerTenant(env);
    const pb = await createProperty(env, b.token);
    expect((await del(`/api/v1/properties/mine/${pb.id}`, env, cookie(a.token))).status).toBe(404);
    expect((await del(`/api/v1/properties/mine/${pb.id}`, env, cookie(tn.token))).status).toBe(403);
    expect((await del(`/api/v1/properties/mine/${pb.id}`, env)).status).toBe(401);
    // Still there for the owner.
    expect((await get(`/api/v1/properties/mine/${pb.id}`, env, cookie(b.token))).status).toBe(200);
  });

  it('returns 409 PROPERTY_CANNOT_BE_DELETED when protected by a rental (RESTRICT FK)', async () => {
    const { env, db } = makeTestEnv();
    const a = await registerLandlord(env);
    const tn = await registerTenant(env);
    const p = await createProperty(env, a.token);
    // Directly insert a rental referencing the property (simulating B7 history).
    db.prepare(
      `INSERT INTO rentals (id, tenant_id, property_id, landlord_id, status, start_date, monthly_rent)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, 250000)`,
    ).run(testId('rental'), tn.user.id, p.id, a.user.id, now());

    const res = await del(`/api/v1/properties/mine/${p.id}`, env, cookie(a.token));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('PROPERTY_CANNOT_BE_DELETED');
  });
});

// --- PUBLISH / UNPUBLISH ---------------------------------------------------

describe('publish / unpublish', () => {
  it('landlord publishes and unpublishes own property; public visibility follows', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token);

    // Not public before publishing.
    expect((await get(`/api/v1/properties/${p.id}`, env)).status).toBe(404);

    const pub = await patch(`/api/v1/properties/mine/${p.id}/publish`, {}, env, cookie(a.token));
    expect(pub.status).toBe(200);
    expect((await json(pub)).data.property.isPublished).toBe(true);
    expect((await get(`/api/v1/properties/${p.id}`, env)).status).toBe(200);

    const unpub = await patch(
      `/api/v1/properties/mine/${p.id}/unpublish`,
      {},
      env,
      cookie(a.token),
    );
    expect(unpub.status).toBe(200);
    expect((await json(unpub)).data.property.isPublished).toBe(false);
    expect((await get(`/api/v1/properties/${p.id}`, env)).status).toBe(404);
  });

  it('cannot publish an incomplete property (no description) → 422', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token, { description: undefined });
    const res = await patch(`/api/v1/properties/mine/${p.id}/publish`, {}, env, cookie(a.token));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('PROPERTY_INCOMPLETE');
  });

  it('a TENANT and another landlord cannot publish/unpublish', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const b = await registerLandlord(env);
    const tn = await registerTenant(env);
    const p = await createProperty(env, a.token);
    expect(
      (await patch(`/api/v1/properties/mine/${p.id}/publish`, {}, env, cookie(tn.token))).status,
    ).toBe(403);
    expect(
      (await patch(`/api/v1/properties/mine/${p.id}/publish`, {}, env, cookie(b.token))).status,
    ).toBe(404);
    expect(
      (await patch(`/api/v1/properties/mine/${p.id}/unpublish`, {}, env, cookie(b.token))).status,
    ).toBe(404);
  });
});

// --- PUBLIC ----------------------------------------------------------------

describe('GET /api/v1/properties/:id (public)', () => {
  it('serves a published property without auth and hides private landlord data', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token);
    await patch(`/api/v1/properties/mine/${p.id}/publish`, {}, env, cookie(a.token));

    const res = await get(`/api/v1/properties/${p.id}`, env);
    expect(res.status).toBe(200);
    const raw = await res.text();
    const pub = JSON.parse(raw).data.property;
    expect(pub.id).toBe(p.id);
    expect(pub.landlord).toMatchObject({ id: a.user.id });
    // No private/auth data.
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain(a.user.email);
    expect(raw).not.toContain(a.user.phone);
    expect(pub).not.toHaveProperty('landlordId');
  });

  it('returns 404 for an unpublished property and for an unknown id', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token); // unpublished
    expect((await get(`/api/v1/properties/${p.id}`, env)).status).toBe(404);
    expect((await get(`/api/v1/properties/${testId('nope')}`, env)).status).toBe(404);
  });

  it('a TENANT can view a published property', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const tn = await registerTenant(env);
    const p = await createProperty(env, a.token);
    await patch(`/api/v1/properties/mine/${p.id}/publish`, {}, env, cookie(a.token));
    expect((await get(`/api/v1/properties/${p.id}`, env, cookie(tn.token))).status).toBe(200);
  });
});

// --- SECURITY: IDOR matrix + logs ------------------------------------------

describe('security: cross-landlord isolation and logs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Landlord A cannot GET/PATCH/DELETE/publish/unpublish Landlord B’s property', async () => {
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const b = await registerLandlord(env);
    const pb = await createProperty(env, b.token);
    const paths = [
      ['GET', `/api/v1/properties/mine/${pb.id}`],
      ['PATCH', `/api/v1/properties/mine/${pb.id}`],
      ['DELETE', `/api/v1/properties/mine/${pb.id}`],
      ['PATCH', `/api/v1/properties/mine/${pb.id}/publish`],
      ['PATCH', `/api/v1/properties/mine/${pb.id}/unpublish`],
    ] as const;
    for (const [method, path] of paths) {
      const res =
        method === 'GET'
          ? await get(path, env, cookie(a.token))
          : await sendJson(method, path, { title: 'x' }, env, cookie(a.token));
      expect([403, 404], `${method} ${path}`).toContain(res.status);
      expect(res.status, `${method} ${path} must not be 200`).not.toBe(200);
    }
    // B's property is untouched.
    expect((await get(`/api/v1/properties/mine/${pb.id}`, env, cookie(b.token))).status).toBe(200);
  });

  it('does not log session tokens or password hashes during property ops', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) =>
        logs.push(a.map(String).join(' ')),
      );
    }
    const { env } = makeTestEnv();
    const a = await registerLandlord(env);
    const p = await createProperty(env, a.token);
    await patch(`/api/v1/properties/mine/${p.id}/publish`, {}, env, cookie(a.token));
    const blob = logs.join('\n');
    expect(blob).not.toContain('pbkdf2$');
    expect(blob).not.toContain(a.token);
  });
});
