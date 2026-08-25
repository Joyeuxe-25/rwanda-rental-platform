import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/notifications';

/**
 * Tests the REAL notification data-access layer against a mocked global `fetch`:
 * the browser calls only the app backend's notification endpoints (never an
 * external provider — SMTP/Twilio/Firebase/Expo/MTN/Airtel), sends credentials,
 * uses no auth token, and passes the documented B12 query params.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

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

const EXTERNAL = /twilio|sendgrid|smtp|firebase|fcm|expo|whatsapp|mtn|momo|airtel/i;

describe('listNotifications (real lib)', () => {
  it('GETs the app backend with documented params, credentials, no-store, no token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          notifications: [],
          unreadCount: 0,
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        },
      }),
    );

    await listNotifications({ page: 2, limit: 20, unread: true, type: 'PAYMENT_SUCCESSFUL' });

    const [url, init] = fetchMock.mock.calls[0]!;
    const u = String(url);
    expect(u).toContain('/api/v1/notifications');
    expect(u).toContain('page=2');
    expect(u).toContain('limit=20');
    expect(u).toContain('unread=true');
    expect(u).toContain('type=PAYMENT_SUCCESSFUL');
    expect(u).not.toMatch(EXTERNAL);
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    expect(init.headers.Authorization).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('mark read (real lib)', () => {
  it('PATCHes the single-read endpoint (no body, credentialed)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { notification: { id: 'n1' } } }),
    );
    await markNotificationRead('n1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/notifications/n1/read');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    expect(String(url)).not.toMatch(EXTERNAL);
  });

  it('PATCHes the read-all endpoint and returns the updated count', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { updated: 4 } }));
    const res = await markAllNotificationsRead();
    expect(res.updated).toBe(4);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/notifications/read-all');
    expect(init.method).toBe('PATCH');
  });
});
