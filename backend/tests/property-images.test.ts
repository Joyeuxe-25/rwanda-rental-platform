import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Bindings } from '../src/types';
import {
  cookie,
  fakeImageBytes,
  get,
  getSetCookie,
  makeTestEnv,
  postJson,
  sendJson,
  uploadImage,
  validRegistration,
} from './helpers/app';

/**
 * B5 property-image tests. Real HTTP path (route → requireAuth → requireRole →
 * controller → service → repository → drizzle/d1 → D1 shim, plus the R2 shim as
 * env.ASSETS). Fresh DB + R2 per test.
 */

async function json(res: Response): Promise<any> {
  return res.json();
}
const patch = (p: string, b: unknown, env: Bindings, c?: string) => sendJson('PATCH', p, b, env, c);
const del = (p: string, env: Bindings, c?: string) => sendJson('DELETE', p, undefined, env, c);

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
async function makeProperty(env: Bindings, token: string, publish = false): Promise<string> {
  const res = await postJson(
    '/api/v1/properties',
    {
      title: 'Img house',
      description: 'has photos',
      propertyType: 'HOUSE',
      bedrooms: 2,
      bathrooms: 1,
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
async function uploadOk(env: Bindings, propertyId: string, token: string, opts = {}): Promise<any> {
  const res = await uploadImage(env, propertyId, token, opts);
  expect(res.status).toBe(201);
  return (await json(res)).data.image;
}

// --- UPLOAD ----------------------------------------------------------------

describe('POST /properties/mine/:id/images (upload)', () => {
  it('401 unauthenticated, 403 tenant', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const tn = await tenant(env);
    const pid = await makeProperty(env, ll.token);
    expect((await uploadImage(env, pid, '')).status).toBe(401);
    expect((await uploadImage(env, pid, tn.token)).status).toBe(403);
  });

  it('accepts JPEG, PNG and WebP; persists metadata + R2 object; generated key', async () => {
    const { env, r2 } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    for (const type of ['jpeg', 'png', 'webp'] as const) {
      const img = await uploadOk(env, pid, ll.token, { type, filename: `../../evil ${type}.EXE` });
      expect(img.mimeType).toBe(`image/${type}`);
      expect(img.url).toBe(`/api/v1/properties/${pid}/images/${img.id}`);
      expect(img).not.toHaveProperty('objectKey');
      expect(img).not.toHaveProperty('storageKey');
      // Server-generated, traversal-safe key present in R2.
      const key = r2.keys().find((k) => k.includes(img.id))!;
      expect(key.startsWith(`properties/${pid}/${img.id}/`)).toBe(true);
      expect(key).not.toContain('..');
      expect(key).not.toContain('evil.exe'.toUpperCase());
    }
    expect(r2.count()).toBe(3);
  });

  it('first image is primary; later ones are not', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const a = await uploadOk(env, pid, ll.token);
    const b = await uploadOk(env, pid, ll.token);
    expect(a.isPrimary).toBe(true);
    expect(b.isPrimary).toBe(false);
  });

  it('rejects missing file (400), bad type (415), oversized (413)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    expect((await uploadImage(env, pid, ll.token, { noFile: true })).status).toBe(400);

    // Non-image bytes (client claims jpeg, but magic bytes are garbage).
    const notImage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await uploadImage(env, pid, ll.token, { bytes: notImage })).status).toBe(415);

    const huge = fakeImageBytes('jpeg', 5 * 1024 * 1024 + 10);
    expect((await uploadImage(env, pid, ll.token, { bytes: huge })).status).toBe(413);
  });

  it('cannot upload to another landlord’s property (404)', async () => {
    const { env } = makeTestEnv();
    const a = await landlord(env);
    const b = await landlord(env);
    const pidB = await makeProperty(env, b.token);
    const res = await uploadImage(env, pidB, a.token);
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('PROPERTY_NOT_FOUND');
  });

  it('enforces the max-images-per-property limit (409)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    for (let i = 0; i < 20; i++) await uploadOk(env, pid, ll.token);
    const res = await uploadImage(env, pid, ll.token);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('IMAGE_LIMIT_REACHED');
  });
});

// --- LIST ------------------------------------------------------------------

describe('GET /properties/mine/:id/images (list)', () => {
  it('lists own images; empty when none', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    expect(
      (await json(await get(`/api/v1/properties/mine/${pid}/images`, env, cookie(ll.token)))).data
        .images,
    ).toEqual([]);
    await uploadOk(env, pid, ll.token);
    const list = (
      await json(await get(`/api/v1/properties/mine/${pid}/images`, env, cookie(ll.token)))
    ).data.images;
    expect(list).toHaveLength(1);
  });

  it('cross-landlord → 404, tenant → 403', async () => {
    const { env } = makeTestEnv();
    const a = await landlord(env);
    const b = await landlord(env);
    const tn = await tenant(env);
    const pidB = await makeProperty(env, b.token);
    expect((await get(`/api/v1/properties/mine/${pidB}/images`, env, cookie(a.token))).status).toBe(
      404,
    );
    expect(
      (await get(`/api/v1/properties/mine/${pidB}/images`, env, cookie(tn.token))).status,
    ).toBe(403);
  });
});

// --- PRIMARY ---------------------------------------------------------------

describe('PATCH .../images/:imageId/primary', () => {
  it('sets primary and clears the previous; idempotent', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const a = await uploadOk(env, pid, ll.token); // primary
    const b = await uploadOk(env, pid, ll.token);

    const r1 = await patch(
      `/api/v1/properties/mine/${pid}/images/${b.id}/primary`,
      {},
      env,
      cookie(ll.token),
    );
    expect(r1.status).toBe(200);
    let list = (await json(r1)).data.images;
    expect(list.find((i: any) => i.id === b.id).isPrimary).toBe(true);
    expect(list.find((i: any) => i.id === a.id).isPrimary).toBe(false);

    // Repeat → still fine, exactly one primary.
    const r2 = await patch(
      `/api/v1/properties/mine/${pid}/images/${b.id}/primary`,
      {},
      env,
      cookie(ll.token),
    );
    list = (await json(r2)).data.images;
    expect(list.filter((i: any) => i.isPrimary)).toHaveLength(1);
  });

  it('cross-property and cross-landlord rejected (404)', async () => {
    const { env } = makeTestEnv();
    const a = await landlord(env);
    const b = await landlord(env);
    const pidA1 = await makeProperty(env, a.token);
    const pidA2 = await makeProperty(env, a.token);
    const img = await uploadOk(env, pidA1, a.token);
    // Image belongs to pidA1, addressed via pidA2 → 404.
    expect(
      (
        await patch(
          `/api/v1/properties/mine/${pidA2}/images/${img.id}/primary`,
          {},
          env,
          cookie(a.token),
        )
      ).status,
    ).toBe(404);
    // Landlord B cannot touch A's property.
    expect(
      (
        await patch(
          `/api/v1/properties/mine/${pidA1}/images/${img.id}/primary`,
          {},
          env,
          cookie(b.token),
        )
      ).status,
    ).toBe(404);
  });
});

// --- REORDER ---------------------------------------------------------------

describe('PATCH .../images/reorder', () => {
  it('reorders by request order', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const a = await uploadOk(env, pid, ll.token);
    const b = await uploadOk(env, pid, ll.token);
    const c = await uploadOk(env, pid, ll.token);
    const res = await patch(
      `/api/v1/properties/mine/${pid}/images/reorder`,
      { imageIds: [c.id, a.id, b.id] },
      env,
      cookie(ll.token),
    );
    expect(res.status).toBe(200);
    const list = (await json(res)).data.images;
    expect(list.map((i: any) => i.id)).toEqual([c.id, a.id, b.id]);
    expect(list.map((i: any) => i.sortOrder)).toEqual([0, 1, 2]);
  });

  it('rejects duplicates, missing, and foreign ids (422)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const a = await uploadOk(env, pid, ll.token);
    const b = await uploadOk(env, pid, ll.token);
    const url = `/api/v1/properties/mine/${pid}/images/reorder`;
    // duplicate
    expect((await patch(url, { imageIds: [a.id, a.id] }, env, cookie(ll.token))).status).toBe(422);
    // missing one (subset)
    expect((await patch(url, { imageIds: [a.id] }, env, cookie(ll.token))).status).toBe(422);
    // foreign id
    expect(
      (await patch(url, { imageIds: [a.id, b.id, 'foreign'] }, env, cookie(ll.token))).status,
    ).toBe(422);
  });

  it('cross-landlord reorder rejected (404)', async () => {
    const { env } = makeTestEnv();
    const a = await landlord(env);
    const b = await landlord(env);
    const pidB = await makeProperty(env, b.token);
    const img = await uploadOk(env, pidB, b.token);
    expect(
      (
        await patch(
          `/api/v1/properties/mine/${pidB}/images/reorder`,
          { imageIds: [img.id] },
          env,
          cookie(a.token),
        )
      ).status,
    ).toBe(404);
  });
});

// --- DELETE ----------------------------------------------------------------

describe('DELETE .../images/:imageId', () => {
  it('removes R2 object and metadata', async () => {
    const { env, r2 } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const img = await uploadOk(env, pid, ll.token);
    expect(r2.count()).toBe(1);
    const res = await del(`/api/v1/properties/mine/${pid}/images/${img.id}`, env, cookie(ll.token));
    expect(res.status).toBe(200);
    expect(r2.count()).toBe(0);
    const list = (
      await json(await get(`/api/v1/properties/mine/${pid}/images`, env, cookie(ll.token)))
    ).data.images;
    expect(list).toHaveLength(0);
  });

  it('deleting primary promotes the next; deleting last leaves no primary', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const a = await uploadOk(env, pid, ll.token); // primary
    const b = await uploadOk(env, pid, ll.token);
    await del(`/api/v1/properties/mine/${pid}/images/${a.id}`, env, cookie(ll.token));
    let list = (
      await json(await get(`/api/v1/properties/mine/${pid}/images`, env, cookie(ll.token)))
    ).data.images;
    expect(list.find((i: any) => i.id === b.id).isPrimary).toBe(true);
    await del(`/api/v1/properties/mine/${pid}/images/${b.id}`, env, cookie(ll.token));
    list = (await json(await get(`/api/v1/properties/mine/${pid}/images`, env, cookie(ll.token))))
      .data.images;
    expect(list).toHaveLength(0);
  });

  it('handles an already-missing R2 object safely', async () => {
    const { env, r2 } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const img = await uploadOk(env, pid, ll.token);
    // Remove the R2 object out-of-band; metadata cleanup must still succeed.
    r2.keys().forEach((k) => k.includes(img.id) && r2.delete(k));
    const res = await del(`/api/v1/properties/mine/${pid}/images/${img.id}`, env, cookie(ll.token));
    expect(res.status).toBe(200);
  });

  it('cross-landlord delete rejected (404)', async () => {
    const { env } = makeTestEnv();
    const a = await landlord(env);
    const b = await landlord(env);
    const pidB = await makeProperty(env, b.token);
    const img = await uploadOk(env, pidB, b.token);
    expect(
      (await del(`/api/v1/properties/mine/${pidB}/images/${img.id}`, env, cookie(a.token))).status,
    ).toBe(404);
  });
});

// --- PUBLIC IMAGE BYTES ----------------------------------------------------

describe('GET /properties/:propertyId/images/:imageId (public bytes)', () => {
  it('serves bytes for a published property with the right Content-Type', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const bytes = fakeImageBytes('png', 200);
    const img = await uploadOk(env, pid, ll.token, { type: 'png', bytes });
    await patch(`/api/v1/properties/mine/${pid}/publish`, {}, env, cookie(ll.token));

    const res = await get(`/api/v1/properties/${pid}/images/${img.id}`, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.length).toBe(bytes.length);
  });

  it('404 when property unpublished, unknown, image unknown, or image in another property', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pidUnpub = await makeProperty(env, ll.token);
    const img = await uploadOk(env, pidUnpub, ll.token);
    // Unpublished:
    expect((await get(`/api/v1/properties/${pidUnpub}/images/${img.id}`, env)).status).toBe(404);
    const ownerImage = await get(
      `/api/v1/properties/${pidUnpub}/images/${img.id}`,
      env,
      cookie(ll.token),
    );
    expect(ownerImage.status).toBe(200);
    await patch(`/api/v1/properties/mine/15048/publish`, {}, env, cookie(ll.token));
    const ownerPublishedImage = await get(`/api/v1/properties/15048/images/${img.id}`, env, cookie(ll.token));
    expect(ownerPublishedImage.status).toBe(200);
    const other = await landlord(env);
    const otherPid = await makeProperty(env, other.token);
    const otherImg = await uploadOk(env, otherPid, other.token);
    const otherOwnerImage = await get(`/api/v1/properties/${otherPid}/images/${otherImg}`, env, cookie(ll.token));
    expect(otherOwnerImage.status).toBe(404);
    // Publish another property, then request the first property's image via it.
    const pidPub = await makeProperty(env, ll.token, true);
    expect((await get(`/api/v1/properties/${pidPub}/images/${img.id}`, env)).status).toBe(404);
    // Unknown ids:
    expect((await get(`/api/v1/properties/unknown/images/${img.id}`, env)).status).toBe(404);
    expect((await get(`/api/v1/properties/${pidPub}/images/unknown`, env)).status).toBe(404);
  });
});

// --- PUBLIC PROPERTY RESPONSE INCLUDES IMAGES ------------------------------

describe('public property response embeds images', () => {
  it('exposes ordered images (id/url/isPrimary/sortOrder) and no storage keys', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const a = await uploadOk(env, pid, ll.token);
    const b = await uploadOk(env, pid, ll.token);
    await patch(
      `/api/v1/properties/mine/${pid}/images/reorder`,
      { imageIds: [b.id, a.id] },
      env,
      cookie(ll.token),
    );
    await patch(`/api/v1/properties/mine/${pid}/publish`, {}, env, cookie(ll.token));

    const res = await get(`/api/v1/properties/${pid}`, env);
    const raw = await res.text();
    const prop = JSON.parse(raw).data.property;
    expect(prop.images.map((i: any) => i.id)).toEqual([b.id, a.id]);
    expect(prop.images[0]).toHaveProperty('url');
    expect(prop.images[0]).not.toHaveProperty('objectKey');
    expect(raw).not.toContain('objectKey');
    expect(raw).not.toContain('object_key');
    // The R2 storage key (e.g. ".../<imageId>/photo.jpg") must not leak — the
    // public URL is "/api/v1/properties/<pid>/images/<imageId>" (no filename).
    expect(raw).not.toContain('photo.');
  });
});

// --- SECURITY: logs --------------------------------------------------------

describe('security: image ops never log secrets', () => {
  afterEach(() => vi.restoreAllMocks());
  it('no session tokens or password hashes in logs', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) =>
        logs.push(a.map(String).join(' ')),
      );
    }
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await makeProperty(env, ll.token);
    const img = await uploadOk(env, pid, ll.token);
    await del(`/api/v1/properties/mine/${pid}/images/${img.id}`, env, cookie(ll.token));
    const blob = logs.join('\n');
    expect(blob).not.toContain('pbkdf2$');
    expect(blob).not.toContain(ll.token);
  });
});
