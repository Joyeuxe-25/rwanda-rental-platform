import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPayment, listMyPayments } from '@/lib/payments';

/**
 * Tests the REAL payment data-access layer against a mocked global `fetch`,
 * asserting the exact wire contract: the Idempotency-Key travels in the HEADER,
 * the body carries only the four allowed fields, no Authorization/token is used,
 * and the browser talks only to the app backend (never MTN/Airtel).
 */

function jsonResponse(body: unknown, status = 201): Response {
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

const pendingPayment = {
  id: 'pay-1',
  rentalId: 'rent-1',
  propertyId: 'prop-1',
  amount: 300000,
  currency: 'RWF',
  paymentPeriod: '2026-08',
  provider: 'MTN_MOMO',
  providerTransactionId: null,
  status: 'PENDING',
  createdAt: '2026-08-20T00:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-08-20T00:00:00.000Z',
  property: {
    id: 'prop-1',
    title: 'Home',
    propertyType: 'APARTMENT',
    district: 'Gasabo',
    sector: 'Remera',
  },
  landlord: { id: 'l1', firstName: 'Aline', lastName: 'M' },
};

describe('createPayment (real lib)', () => {
  it('sends Idempotency-Key header, a minimal body, credentials, and no token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { payment: pendingPayment } }));

    const result = await createPayment(
      { rentalId: 'rent-1', amount: 300000, paymentPeriod: '2026-08', provider: 'MTN_MOMO' },
      'idem-key-12345678',
    );
    expect(result.status).toBe('PENDING');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    // App backend only — never a provider URL.
    expect(String(url)).toContain('/api/v1/payments');
    expect(String(url)).not.toMatch(/mtn|momo|airtel/i);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');

    // Idempotency key in the HEADER, not the body.
    expect(init.headers['Idempotency-Key']).toBe('idem-key-12345678');
    expect(init.headers.Authorization).toBeUndefined();

    // Body carries ONLY the four allowed fields.
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(
      ['amount', 'paymentPeriod', 'provider', 'rentalId'].sort(),
    );
    for (const forbidden of [
      'tenantId',
      'landlordId',
      'propertyId',
      'status',
      'providerTransactionId',
      'idempotencyKey',
      'currency',
      'completedAt',
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }

    // No token persistence.
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('listMyPayments (real lib)', () => {
  it('GETs the tenant payments with credentials and no-store', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { payments: [] } }, 200));
    await listMyPayments();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/payments/mine');
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
  });
});
