import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Bindings } from '../src/types';
import {
  cookie,
  get,
  getSetCookie,
  makeTestEnv,
  postJson,
  sendJson,
  uploadImage,
  validRegistration,
} from './helpers/app';
import type { TestDb } from './helpers/testDb';

/**
 * B17 public property discovery tests. Real HTTP path (route → query validation
 * → controller → service → repository → D1 shim). No auth is required for the
 * public list; management routes stay protected.
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
    validRegistration({ role: 'LANDLORD', email: `pp-ll${seq}@example.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function tenant(env: Bindings) {
  seq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'TENANT', email: `pp-tn${seq}@example.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}

type PropOverrides = Record<string, unknown>;
/** Create a property (optionally publish it). Returns the management property. */
async function makeProperty(
  env: Bindings,
  token: string,
  overrides: PropOverrides = {},
  publish = true,
) {
  const body = {
    title: 'A Home',
    description: 'A comfortable place to live.',
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    monthlyRent: 300000,
    securityDeposit: 300000,
    province: 'Kigali',
    district: 'Gasabo',
    sector: 'Remera',
    ...overrides,
  };
  const created = (await json(await postJson('/api/v1/properties', body, env, cookie(token)))).data
    .property;
  if (publish) {
    await patch(`/api/v1/properties/mine/${created.id}/publish`, {}, env, cookie(token));
  }
  return created;
}

const list = (env: Bindings, qs = '', c?: string) => get(`/api/v1/properties${qs}`, env, c);

afterEach(() => vi.restoreAllMocks());

// ============================================================================
// Auth-free access
// ============================================================================
describe('public list — access', () => {
  it('requires NO authentication (anonymous visitor)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await makeProperty(env, ll.token);
    const res = await list(env); // no cookie
    expect(res.status).toBe(200);
    expect((await json(res)).data.properties.length).toBe(1);
  });

  it('is usable by a tenant and a landlord too', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await makeProperty(env, ll.token);
    const tn = await tenant(env);
    expect((await list(env, '', cookie(tn.token))).status).toBe(200);
    expect((await list(env, '', cookie(ll.token))).status).toBe(200);
  });

  it('management routes remain protected (regression)', async () => {
    const { env } = makeTestEnv();
    expect((await get('/api/v1/properties/mine', env)).status).toBe(401);
  });
});

// ============================================================================
// Publication rule
// ============================================================================
describe('public list — publication rule', () => {
  it('shows published properties and NEVER unpublished ones', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const published = await makeProperty(env, ll.token, { title: 'Published Home' }, true);
    const draft = await makeProperty(env, ll.token, { title: 'Draft Home' }, false);

    const data = (await json(await list(env))).data;
    const ids = data.properties.map((p: any) => p.id);
    expect(ids).toContain(published.id);
    expect(ids).not.toContain(draft.id);
    expect(data.properties.every((p: any) => p.title !== 'Draft Home')).toBe(true);
  });

  it('an unpublished AVAILABLE property with a known id still never appears', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const draft = await makeProperty(env, ll.token, { status: undefined }, false); // default AVAILABLE, unpublished
    const data = (await json(await list(env, '?status=AVAILABLE'))).data;
    expect(data.properties.map((p: any) => p.id)).not.toContain(draft.id);
    // Public detail also hides it.
    expect((await get(`/api/v1/properties/${draft.id}`, env)).status).toBe(404);
  });
});

// ============================================================================
// Pagination
// ============================================================================
describe('public list — pagination', () => {
  it('paginates with correct total / totalPages and bounded page size', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    for (let i = 0; i < 3; i++) await makeProperty(env, ll.token, { title: `Home ${i}` });

    const p1 = (await json(await list(env, '?limit=2&page=1'))).data;
    expect(p1.properties.length).toBe(2);
    expect(p1.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const p2 = (await json(await list(env, '?limit=2&page=2'))).data;
    expect(p2.properties.length).toBe(1);
    expect(p2.pagination).toMatchObject({ page: 2, total: 3 });

    // No overlap between pages.
    const ids1 = p1.properties.map((p: any) => p.id);
    const ids2 = p2.properties.map((p: any) => p.id);
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
  });

  it('empty results return 200 with [] and total 0 (never 404)', async () => {
    const { env } = makeTestEnv();
    const res = await list(env, '?district=Nowhere');
    expect(res.status).toBe(200);
    const data = (await json(res)).data;
    expect(data.properties).toEqual([]);
    expect(data.pagination).toMatchObject({ total: 0, page: 1 });
  });
});

// ============================================================================
// Filters
// ============================================================================
describe('public list — filters', () => {
  async function seed(env: Bindings, token: string) {
    await makeProperty(env, token, {
      title: 'Cheap Studio',
      propertyType: 'STUDIO',
      monthlyRent: 100000,
      bedrooms: 1,
      bathrooms: 1,
      district: 'Kicukiro',
      sector: 'Niboye',
    });
    await makeProperty(env, token, {
      title: 'Mid House',
      propertyType: 'HOUSE',
      monthlyRent: 300000,
      bedrooms: 3,
      bathrooms: 2,
      district: 'Gasabo',
      sector: 'Remera',
    });
    await makeProperty(env, token, {
      title: 'Pricey Apartment',
      propertyType: 'APARTMENT',
      monthlyRent: 800000,
      bedrooms: 2,
      bathrooms: 2,
      district: 'Gasabo',
      sector: 'Kimironko',
    });
  }
  const titles = (d: any) => d.properties.map((p: any) => p.title).sort();

  it('filters by propertyType', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await seed(env, ll.token);
    expect(titles((await json(await list(env, '?propertyType=HOUSE'))).data)).toEqual([
      'Mid House',
    ]);
  });

  it('filters by minRent and maxRent', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await seed(env, ll.token);
    expect(titles((await json(await list(env, '?minRent=250000'))).data)).toEqual([
      'Mid House',
      'Pricey Apartment',
    ]);
    expect(titles((await json(await list(env, '?maxRent=250000'))).data)).toEqual(['Cheap Studio']);
    expect(titles((await json(await list(env, '?minRent=200000&maxRent=500000'))).data)).toEqual([
      'Mid House',
    ]);
  });

  it('filters by bedrooms and bathrooms', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await seed(env, ll.token);
    expect(titles((await json(await list(env, '?bedrooms=3'))).data)).toEqual(['Mid House']);
    expect(titles((await json(await list(env, '?bathrooms=1'))).data)).toEqual(['Cheap Studio']);
  });

  it('filters by province / district / sector (exact match)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await seed(env, ll.token);
    expect(titles((await json(await list(env, '?district=Gasabo'))).data)).toEqual([
      'Mid House',
      'Pricey Apartment',
    ]);
    expect(titles((await json(await list(env, '?sector=Kimironko'))).data)).toEqual([
      'Pricey Apartment',
    ]);
    expect(titles((await json(await list(env, '?province=Kigali'))).data).length).toBe(3);
  });

  it('filters by status (still published-only)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await seed(env, ll.token);
    // All seeded are AVAILABLE + published.
    expect((await json(await list(env, '?status=AVAILABLE'))).data.properties.length).toBe(3);
    expect((await json(await list(env, '?status=OCCUPIED'))).data.properties.length).toBe(0);
  });

  it('supports a safe text search (q) over public fields', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await seed(env, ll.token);
    expect(titles((await json(await list(env, '?q=Kimironko'))).data)).toEqual([
      'Pricey Apartment',
    ]);
    expect(titles((await json(await list(env, '?q=House'))).data)).toEqual(['Mid House']);
  });

  it('sorts by rent_asc / rent_desc, default newest', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await seed(env, ll.token);
    const asc = (await json(await list(env, '?sort=rent_asc'))).data.properties.map(
      (p: any) => p.monthlyRent,
    );
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = (await json(await list(env, '?sort=rent_desc'))).data.properties.map(
      (p: any) => p.monthlyRent,
    );
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });
});

// ============================================================================
// Validation (422)
// ============================================================================
describe('public list — validation', () => {
  const cases: [string, string][] = [
    ['invalid propertyType', '?propertyType=MANSION'],
    ['invalid status', '?status=PENDING'],
    ['page below 1', '?page=0'],
    ['limit below 1', '?limit=0'],
    ['limit above max', '?limit=101'],
    ['negative minRent', '?minRent=-1'],
    ['decimal minRent', '?minRent=1.5'],
    ['minRent greater than maxRent', '?minRent=500000&maxRent=100000'],
    ['unknown query parameter', '?bogus=1'],
    ['invalid sort', '?sort=random_sql'],
  ];
  for (const [name, qs] of cases) {
    it(`rejects ${name} with 422`, async () => {
      const { env } = makeTestEnv();
      const res = await list(env, qs);
      expect(res.status).toBe(422);
    });
  }
});

// ============================================================================
// Public-data safety
// ============================================================================
describe('public list — data safety', () => {
  it('exposes only safe landlord fields and a primary image; no secrets or storage keys', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const prop = await makeProperty(env, ll.token, {}, false); // create unpublished first to add image
    await uploadImage(env, prop.id, ll.token, { type: 'jpeg' });
    await patch(`/api/v1/properties/mine/${prop.id}/publish`, {}, env, cookie(ll.token));

    const res = await list(env);
    const item = (await json(res)).data.properties[0];
    // Landlord: id + name only.
    expect(Object.keys(item.landlord).sort()).toEqual(['firstName', 'id', 'lastName']);
    // Primary image present with a safe public URL (no R2 object key).
    expect(item.images.length).toBe(1);
    expect(item.images[0].isPrimary).toBe(true);
    expect(item.images[0].url).toMatch(/^\/api\/v1\/properties\//);

    const raw = JSON.stringify(item);
    for (const leak of [
      'passwordHash',
      'password_hash',
      'email',
      'phone',
      'objectKey',
      'object_key',
      'landlordId',
    ]) {
      expect(raw).not.toContain(leak);
    }
  });

  it('does not leak secrets to logs when listing', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
      });
    }
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    await makeProperty(env, ll.token);
    await list(env);
    const blob = logs.join('\n').toLowerCase();
    expect(blob).not.toContain('passwordhash');
    expect(blob).not.toContain('rrp_session=');
  });

  it('public detail endpoint still works (regression)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const prop = await makeProperty(env, ll.token, { title: 'Detail Home' });
    const res = await get(`/api/v1/properties/${prop.id}`, env);
    expect(res.status).toBe(200);
    expect((await json(res)).data.property.title).toBe('Detail Home');
  });
});

// ============================================================================
// Query performance / scale (DB-level pagination, no in-memory filtering)
// ============================================================================
describe('public list — scale', () => {
  it('paginates a large published set correctly (LIMIT/OFFSET at the DB)', async () => {
    const { env, db } = makeTestEnv();
    const ll = await landlord(env);
    // Bulk-insert 120 published properties directly (fast; exercises query, not HTTP).
    bulkInsertPublished(db, ll.user.id, 120);

    const first = (await json(await list(env, '?limit=20&page=1'))).data;
    expect(first.properties.length).toBe(20);
    expect(first.pagination).toMatchObject({ total: 120, totalPages: 6, page: 1, limit: 20 });

    const last = (await json(await list(env, '?limit=20&page=6'))).data;
    expect(last.properties.length).toBe(20);

    const beyond = (await json(await list(env, '?limit=20&page=7'))).data;
    expect(beyond.properties.length).toBe(0);
    expect(beyond.pagination.total).toBe(120);
  });
});

/** Directly insert N published properties for a landlord (test-only, fast). */
function bulkInsertPublished(db: TestDb, landlordId: string, n: number): void {
  const now = Date.now();
  const stmt = db.prepare(
    `INSERT INTO properties (id, landlord_id, title, description, property_type, bedrooms, bathrooms,
      monthly_rent, security_deposit, additional_charges, currency, province, district, sector,
      cell, village_or_area, additional_location, amenities, status, is_published, published_at,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, 'APARTMENT', 2, 1, ?, 0, 0, 'RWF', 'Kigali', 'Gasabo', 'Remera',
      NULL, NULL, NULL, '[]', 'AVAILABLE', 1, ?, ?, ?)`,
  );
  for (let i = 0; i < n; i++) {
    stmt.run(
      crypto.randomUUID(),
      landlordId,
      `Bulk Home ${i}`,
      'A place.',
      100000 + i * 1000,
      now + i,
      now + i,
      now + i,
    );
  }
}
