import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMyProfile, updateMyProfile } from '@/lib/profile';

/**
 * Tests the REAL profile data-access layer against a mocked global `fetch`:
 * `PATCH /users/me` sends only the changed fields, is credentialed, uses no auth
 * token / no token storage, and talks only to the app backend (no D1/R2/provider).
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const safeUser = {
  id: 'u1',
  role: 'TENANT',
  firstName: 'Amara',
  lastName: 'Keza',
  email: 'amara@keza.rw',
  phone: '+250788000000',
  profileImageKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;
let setItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem, removeItem: vi.fn(), clear: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('updateMyProfile (real lib)', () => {
  it('PATCHes /users/me with only the given fields, credentialed, no token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { user: { ...safeUser, firstName: 'Ama' } } }),
    );
    const result = await updateMyProfile({ firstName: 'Ama' });
    expect(result.firstName).toBe('Ama');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/users/me');
    expect(String(url)).not.toMatch(/d1|r2|mtn|airtel/i);
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBeUndefined();

    const body = JSON.parse(init.body);
    expect(body).toEqual({ firstName: 'Ama' });
    for (const forbidden of ['role', 'email', 'id', 'userId', 'password', 'createdAt']) {
      expect(body).not.toHaveProperty(forbidden);
    }
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('getMyProfile (real lib)', () => {
  it('GETs /users/me credentialed and no-store', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { user: safeUser } }));
    const user = await getMyProfile();
    expect(user.email).toBe('amara@keza.rw');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/users/me');
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
  });
});
