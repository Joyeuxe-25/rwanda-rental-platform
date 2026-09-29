import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createProperty,
  deletePropertyImage,
  getMyProperty,
  listMyProperties,
  publishMyProperty,
  reorderPropertyImages,
  setPrimaryPropertyImage,
  unpublishMyProperty,
  updateMyProperty,
  uploadPropertyImage,
} from '@/lib/managed-properties';
import type { ManagedProperty, PropertyInput } from '@/types/managed-property';

/**
 * Tests the REAL landlord property/image data-access layer against a mocked
 * global `fetch`, asserting the exact B4/B5 wire contract: server-controlled
 * fields are never sent, image upload uses multipart field `file` (no storage
 * key), reorder sends `{ imageIds }` only, every call is credentialed, reads are
 * no-store, and no token is ever persisted or sent.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const managed: ManagedProperty = {
  id: 'prop-1',
  landlordId: 'l1',
  title: 'Sunny Apartment',
  description: 'Nice place',
  propertyType: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 1,
  monthlyRent: 300000,
  securityDeposit: 250000,
  otherCharges: 0,
  currency: 'RWF',
  province: 'Kigali City',
  district: 'Gasabo',
  sector: 'Remera',
  cell: null,
  village: null,
  additionalLocation: null,
  amenities: ['Parking'],
  status: 'AVAILABLE',
  isPublished: false,
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const fullInput: PropertyInput = {
  title: 'Sunny Apartment',
  propertyType: 'APARTMENT',
  description: 'Nice place',
  bedrooms: 2,
  bathrooms: 1,
  monthlyRent: 300000,
  securityDeposit: 250000,
  otherCharges: 0,
  province: 'Kigali City',
  district: 'Gasabo',
  sector: 'Remera',
  amenities: ['Parking'],
};

const FORBIDDEN_BODY_KEYS = [
  'id',
  'landlordId',
  'status',
  'isPublished',
  'publishedAt',
  'currency',
  'createdAt',
  'updatedAt',
  'propertyId',
  'storageKey',
  'objectKey',
];

let fetchMock: ReturnType<typeof vi.fn>;
let setItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setItem = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(),
    setItem,
    removeItem: vi.fn(),
    clear: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('property reads (real lib)', () => {
  it('lists my properties with credentials and no-store', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { properties: [managed] } }));
    const result = await listMyProperties();
    expect(result).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine');
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('gets a single owned property (no-store)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { property: managed } }));
    await getMyProperty('prop-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine/prop-1');
    expect(init.cache).toBe('no-store');
  });
});

describe('createProperty (real lib)', () => {
  it('POSTs only editable fields — never server-controlled ones', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { property: managed } }, 201));
    await createProperty(fullInput);

    const [url, init] = fetchMock.mock.calls[0]!;
    // Create posts to the collection root, NOT /mine (which is 404 on the backend).
    expect(String(url)).toMatch(/\/api\/v1\/properties$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const body = JSON.parse(init.body);
    for (const forbidden of FORBIDDEN_BODY_KEYS) expect(body).not.toHaveProperty(forbidden);
    // Uses backend field names (otherCharges/village), not the alternates.
    expect(body).toHaveProperty('otherCharges');
    expect(body).not.toHaveProperty('additionalCharges');
    expect(body).not.toHaveProperty('villageOrArea');
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('updateMyProperty (real lib)', () => {
  it('PATCHes ONLY the changed fields', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { property: managed } }));
    await updateMyProperty('prop-1', { title: 'New title', monthlyRent: 350000 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine/prop-1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(['monthlyRent', 'title']);
    for (const forbidden of FORBIDDEN_BODY_KEYS) expect(body).not.toHaveProperty(forbidden);
  });
});

describe('publish / unpublish (real lib)', () => {
  it('publishes via the dedicated endpoint (no status/isPublished body)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { property: { ...managed, isPublished: true } } }),
    );
    await publishMyProperty('prop-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine/prop-1/publish');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBeUndefined();
  });

  it('unpublishes via the dedicated endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { property: managed } }));
    await unpublishMyProperty('prop-1');
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine/prop-1/unpublish');
  });
});

describe('image management (real lib)', () => {
  it('uploads as multipart with ONLY the `file` field (no storage key, no JSON)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: { image: { id: 'img-1', url: '/x', isPrimary: true, sortOrder: 0 } },
        },
        201,
      ),
    );
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    await uploadPropertyImage('prop-1', file);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine/prop-1/images');
    expect(String(url)).not.toMatch(/r2|storage|amazonaws|cloudflarestorage/i);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    // Body is FormData, not JSON, and carries exactly the `file` field.
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(Array.from(form.keys())).toEqual(['file']);
    expect(form.get('file')).toBeInstanceOf(File);
    // The multipart Content-Type is set by the browser, not us.
    expect(init.headers?.['Content-Type']).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('reorders with a body of `{ imageIds }` ONLY', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { images: [] } }));
    await reorderPropertyImages('prop-1', ['b', 'a', 'c']);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine/prop-1/images/reorder');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(Object.keys(body)).toEqual(['imageIds']);
    expect(body.imageIds).toEqual(['b', 'a', 'c']);
  });

  it('sets a primary image via its dedicated endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { images: [] } }));
    await setPrimaryPropertyImage('prop-1', 'img-9');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine/prop-1/images/img-9/primary');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBeUndefined();
  });

  it('deletes an image by id in the URL', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { message: 'Image deleted' } }),
    );
    await deletePropertyImage('prop-1', 'img-9');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/properties/mine/prop-1/images/img-9');
    expect(init.method).toBe('DELETE');
  });
});
