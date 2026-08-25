import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchCurrentUser, loginRequest, safeInternalPath } from '@/lib/auth';
import type { AuthUser } from '@/types/auth';

const user: AuthUser = {
  id: 'u1',
  role: 'TENANT',
  firstName: 'Jean',
  lastName: 'Uwimana',
  email: 'jean@example.rw',
  phone: '+250788123456',
  profileImageKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.restoreAllMocks());

describe('auth data layer', () => {
  it('fetchCurrentUser returns the user on 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ success: true, data: user }));
    await expect(fetchCurrentUser()).resolves.toEqual(user);
  });

  it('fetchCurrentUser returns null on 401 (unauthenticated)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: false, error: { message: 'x', code: 'AUTH_UNAUTHORIZED' } }, 401),
    );
    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it('login POSTs to /auth/login with credentials and no token storage', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true, data: user }));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const res = await loginRequest({ email: 'jean@example.rw', password: 'secret-pass' });
    expect(res).toEqual(user);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/v1\/auth\/login$/);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).credentials).toBe('include');
    expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
    // No token/credential is ever written to storage.
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('safeInternalPath (open-redirect guard)', () => {
  it('accepts internal relative paths (with query)', () => {
    expect(safeInternalPath('/properties/abc-123')).toBe('/properties/abc-123');
    expect(safeInternalPath('/properties/abc?x=1&y=2')).toBe('/properties/abc?x=1&y=2');
    expect(safeInternalPath('/account')).toBe('/account');
  });

  it('rejects open redirects and dangerous values → fallback', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      'http://x',
      '/\\evil.example',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
      '/path\twith-control',
      ' /leading-space',
      'relative/path',
      '',
      null,
      undefined,
    ]) {
      expect(safeInternalPath(bad as string)).toBe('/');
    }
  });

  it('uses a custom fallback when provided', () => {
    expect(safeInternalPath('https://evil', '/account')).toBe('/account');
  });
});
