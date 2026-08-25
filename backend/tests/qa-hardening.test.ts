import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { onError, notFound } from '../src/lib/errorHandler';
import { rateLimit } from '../src/middleware/rateLimit';
import { hashPassword, verifyPassword } from '../src/lib/crypto/password';
import { normalizePhone, normalizeEmail } from '../src/utils/normalize';
import {
  clearWebhookAdapters,
  registerWebhookAdapter,
} from '../src/services/payment-providers/registry';
import type {
  NormalizedWebhookEvent,
  PaymentWebhookAdapter,
  WebhookVerificationContext,
} from '../src/types/payment';
import type { AppEnv, Bindings } from '../src/types';
import {
  app,
  cookie,
  get,
  getSetCookie,
  makeTestEnv,
  postJson,
  sendJson,
  uploadImage,
  validRegistration,
} from './helpers/app';

/**
 * B14 QA / hardening suite. Unit-level tests for security and error-handling
 * code that the integration suites exercise only indirectly (rate-limit
 * enforcement, error disclosure, password-verify guards, phone normalization,
 * the deleted-user auth edge), plus one consolidated end-to-end business
 * journey. Tests EXISTING behavior only — no new product functionality.
 */

async function json(res: Response): Promise<any> {
  return res.json();
}
const patch = (p: string, b: unknown, env: Bindings, c?: string) => sendJson('PATCH', p, b, env, c);

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// A. Centralized error handler — envelope consistency + production disclosure
// ============================================================================
describe('error handler (onError)', () => {
  // A throwaway app that wires the REAL onError and deliberately throws each
  // error class, so every branch of the handler is exercised end-to-end.
  function harness() {
    const h = new Hono<AppEnv>();
    h.get('/raw', () => {
      throw new Error('boom-secret-internal-detail');
    });
    h.get('/zod', () => {
      z.object({ a: z.string() }).parse({}); // throws a raw ZodError
      return new Response('unreachable');
    });
    h.get('/http', () => {
      throw new HTTPException(418, { message: "I'm a teapot" });
    });
    h.notFound(notFound);
    h.onError(onError);
    return h;
  }
  const prod = { ENVIRONMENT: 'production' } as unknown as Bindings;
  const dev = { ENVIRONMENT: 'development' } as unknown as Bindings;

  it('unknown error → 500 generic in production (no stack, no internal detail leaked)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await harness().request('/raw', {}, prod);
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body).toEqual({
      success: false,
      error: { message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' },
    });
    expect(JSON.stringify(body)).not.toContain('boom-secret-internal-detail');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('unknown error → 500 with diagnostic detail only OUTSIDE production', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await harness().request('/raw', {}, dev);
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toContain('boom-secret-internal-detail'); // dev diagnostics
    expect(body.error.details).toBeDefined();
  });

  it('raw ZodError → 422 VALIDATION_ERROR with field details', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await harness().request('/zod', {}, prod);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details[0]).toHaveProperty('path');
  });

  it('Hono HTTPException → its status + HTTP_ERROR envelope', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await harness().request('/http', {}, prod);
    expect(res.status).toBe(418);
    expect((await json(res)).error.code).toBe('HTTP_ERROR');
  });

  it('unmatched route → 404 ROUTE_NOT_FOUND envelope', async () => {
    const res = await harness().request('/nope', {}, prod);
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('ROUTE_NOT_FOUND');
  });
});

// ============================================================================
// B. Rate-limit middleware — enforcement (429), window reset, per-IP isolation
// ============================================================================
describe('rate-limit enforcement', () => {
  function limited(key: string, limit: number, windowMs: number) {
    const h = new Hono<AppEnv>();
    h.use('*', rateLimit({ key, limit, windowMs }));
    h.get('/', (c) => c.text('ok'));
    h.onError(onError);
    return h;
  }
  const devEnv = { ENVIRONMENT: 'development' } as unknown as Bindings;
  const testEnv = { ENVIRONMENT: 'test' } as unknown as Bindings;
  const withIp = (ip: string) => ({ headers: { 'cf-connecting-ip': ip } });

  it('allows up to the limit then returns 429 AUTH_RATE_LIMITED', async () => {
    const h = limited('qa-rl-1', 2, 60_000);
    expect((await h.request('/', withIp('9.9.9.1'), devEnv)).status).toBe(200);
    expect((await h.request('/', withIp('9.9.9.1'), devEnv)).status).toBe(200);
    const blocked = await h.request('/', withIp('9.9.9.1'), devEnv);
    expect(blocked.status).toBe(429);
    expect((await json(blocked)).error.code).toBe('AUTH_RATE_LIMITED');
  });

  it('counts are isolated per client IP', async () => {
    const h = limited('qa-rl-2', 1, 60_000);
    expect((await h.request('/', withIp('9.9.9.2'), devEnv)).status).toBe(200);
    expect((await h.request('/', withIp('9.9.9.2'), devEnv)).status).toBe(429);
    // A different IP has its own fresh bucket.
    expect((await h.request('/', withIp('9.9.9.3'), devEnv)).status).toBe(200);
  });

  it('the window resets after it elapses (past resetAt)', async () => {
    const h = limited('qa-rl-3', 1, 20); // 20 ms window
    expect((await h.request('/', withIp('9.9.9.4'), devEnv)).status).toBe(200);
    expect((await h.request('/', withIp('9.9.9.4'), devEnv)).status).toBe(429);
    await new Promise((r) => setTimeout(r, 30));
    expect((await h.request('/', withIp('9.9.9.4'), devEnv)).status).toBe(200);
  });

  it('is skipped entirely in the test environment (never limits tests)', async () => {
    const h = limited('qa-rl-4', 1, 60_000);
    for (let i = 0; i < 5; i++) {
      expect((await h.request('/', withIp('9.9.9.5'), testEnv)).status).toBe(200);
    }
  });
});

// ============================================================================
// C. Password verify — never throws on malformed stored hash (constant-time)
// ============================================================================
describe('password verify guards', () => {
  it('round-trips a real hash and rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong password', stored)).toBe(false);
  });

  it('returns false (never throws) for malformed stored hashes', async () => {
    for (const bad of [
      '', // empty
      'not-a-hash',
      'bcrypt$sha256$1$aa$bb', // wrong algorithm prefix
      'pbkdf2$sha256$abc$aa$bb', // non-integer iterations
      'pbkdf2$sha256$0$aa$bb', // zero iterations
      'pbkdf2$sha256$100000$onlyfourparts', // too few segments
    ]) {
      await expect(verifyPassword('whatever', bad)).resolves.toBe(false);
    }
  });
});

// ============================================================================
// D. Phone / email normalization — all documented branches
// ============================================================================
describe('normalization', () => {
  it('normalizes every accepted Rwandan phone form to E.164', () => {
    const cases: Array<[string, string]> = [
      ['+250788123456', '+250788123456'],
      ['250788123456', '+250788123456'],
      ['0788123456', '+250788123456'],
      ['788123456', '+250788123456'],
      ['+250 788 123 456', '+250788123456'],
      ['(0788)-123-456', '+250788123456'],
    ];
    for (const [input, expected] of cases) expect(normalizePhone(input)).toBe(expected);
  });

  it('passes through unrecognized input trimmed (validation rejects upstream)', () => {
    expect(normalizePhone('  12345  ')).toBe('12345');
  });

  it('normalizes email (trim + lowercase)', () => {
    expect(normalizeEmail('  User@Example.RW ')).toBe('user@example.rw');
  });
});

// ============================================================================
// E. Auth edge — a valid session whose user no longer exists → 401
// ============================================================================
describe('auth session/user consistency', () => {
  it('a valid session pointing at a deleted user is rejected (401)', async () => {
    const { env, db } = makeTestEnv();
    const reg = await postJson(
      '/api/v1/auth/register',
      validRegistration({ role: 'TENANT', email: 'qa-del@example.rw' }),
      env,
    );
    const token = getSetCookie(reg)!;
    expect((await get('/api/v1/users/me', env, cookie(token))).status).toBe(200);
    // Hard-delete the user row out from under a still-valid session.
    db.prepare('DELETE FROM users').run();
    const res = await get('/api/v1/users/me', env, cookie(token));
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe('AUTH_SESSION_INVALID');
  });
});

// ============================================================================
// F. Consolidated END-TO-END business journey (tenant + landlord + payment)
// ============================================================================
const e2eAdapter: PaymentWebhookAdapter = {
  name: 'MTN_MOMO',
  async verify(ctx: WebhookVerificationContext): Promise<boolean> {
    return ctx.headers['x-test-signature'] === 'valid';
  },
  normalize(ctx: WebhookVerificationContext): NormalizedWebhookEvent {
    const b = JSON.parse(ctx.rawBody) as Record<string, unknown>;
    return {
      provider: 'MTN_MOMO',
      externalEventId: (b.externalEventId as string | null) ?? null,
      externalTransactionId: (b.externalTransactionId as string | null) ?? null,
      status: b.status as NormalizedWebhookEvent['status'],
      amount: (b.amount as number | null) ?? null,
      currency: (b.currency as string | null) ?? null,
    };
  },
};

beforeAll(() => {
  clearWebhookAdapters();
  registerWebhookAdapter(e2eAdapter);
});

describe('end-to-end MVP journey', () => {
  it('landlord + tenant complete the full rental→payment→notification flow', async () => {
    const { env, db } = makeTestEnv();

    // --- Landlord: register, create property, upload image, publish ---
    const llRes = await postJson(
      '/api/v1/auth/register',
      validRegistration({ role: 'LANDLORD', email: 'e2e-ll@example.rw' }),
      env,
    );
    const llToken = getSetCookie(llRes)!;
    const pid = (
      await json(
        await postJson(
          '/api/v1/properties',
          {
            title: 'Kigali flat',
            description: 'A tidy two-bedroom near Remera.',
            propertyType: 'APARTMENT',
            monthlyRent: 250000,
            securityDeposit: 250000,
            province: 'Kigali',
            district: 'Gasabo',
            sector: 'Remera',
          },
          env,
          cookie(llToken),
        ),
      )
    ).data.property.id as string;
    expect((await uploadImage(env, pid, llToken, { type: 'png' })).status).toBe(201);
    expect(
      (await patch(`/api/v1/properties/mine/${pid}/publish`, {}, env, cookie(llToken))).status,
    ).toBe(200);

    // --- Public: property is visible with its image ---
    const pub = await json(await get(`/api/v1/properties/${pid}`, env));
    expect(pub.data.property.images.length).toBe(1);

    // --- Tenant: register, request the property ---
    const tnRes = await postJson(
      '/api/v1/auth/register',
      validRegistration({ role: 'TENANT', email: 'e2e-tn@example.rw' }),
      env,
    );
    const tnToken = getSetCookie(tnRes)!;
    const rr = (
      await json(
        await postJson('/api/v1/rental-requests', { propertyId: pid }, env, cookie(tnToken)),
      )
    ).data.rentalRequest;
    expect(rr.status).toBe('PENDING');

    // --- Landlord: accept → tenant converts to an ACTIVE rental ---
    await patch(`/api/v1/rental-requests/landlord/${rr.id}/approve`, {}, env, cookie(llToken));
    const rental = (
      await json(await postJson(`/api/v1/rentals/from-request/${rr.id}`, {}, env, cookie(tnToken)))
    ).data.rental;
    expect(rental.status).toBe('ACTIVE');
    // Invariant: ACTIVE rental ⇔ property OCCUPIED.
    expect((db.prepare('SELECT status FROM properties WHERE id = ?').get(pid) as any).status).toBe(
      'OCCUPIED',
    );

    // --- Tenant: create a payment intent (PENDING) ---
    const payRes = await app.request(
      '/api/v1/payments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie(tnToken),
          'Idempotency-Key': 'e2e-key-abcdef12',
        },
        body: JSON.stringify({
          rentalId: rental.id,
          amount: 250000,
          paymentPeriod: '2026-08',
          provider: 'MTN_MOMO',
        }),
      },
      env,
    );
    expect(payRes.status).toBe(201);
    const payment = (await json(payRes)).data.payment;
    expect(payment.status).toBe('PENDING');

    // Link a provider transaction id (as B10 initiation would) so the webhook correlates.
    db.prepare('UPDATE payments SET provider_transaction_id = ? WHERE id = ?').run(
      'E2E-TX-1',
      payment.id,
    );

    // --- Provider: verified SUCCESSFUL callback → payment SUCCESSFUL ---
    const wh = await app.request(
      '/api/v1/payment-webhooks/MTN_MOMO',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Test-Signature': 'valid' },
        body: JSON.stringify({
          externalEventId: 'E2E-EVT-1',
          externalTransactionId: 'E2E-TX-1',
          status: 'SUCCESSFUL',
          amount: 250000,
          currency: 'RWF',
        }),
      },
      env,
    );
    expect(wh.status).toBe(200);
    expect(
      (db.prepare('SELECT status FROM payments WHERE id = ?').get(payment.id) as any).status,
    ).toBe('SUCCESSFUL');

    // --- Notifications: both parties received the expected events ---
    const tnNotifs = await json(await get('/api/v1/notifications', env, cookie(tnToken)));
    const llNotifs = await json(await get('/api/v1/notifications', env, cookie(llToken)));
    const tnTypes = tnNotifs.data.notifications.map((n: any) => n.type);
    const llTypes = llNotifs.data.notifications.map((n: any) => n.type);
    expect(tnTypes).toContain('RENTAL_REQUEST_SUBMITTED');
    expect(tnTypes).toContain('RENTAL_ACTIVATED');
    expect(tnTypes).toContain('PAYMENT_SUCCESSFUL');
    expect(llTypes).toContain('NEW_RENTAL_REQUEST');
    expect(llTypes).toContain('PAYMENT_RECEIVED');
    // No secrets ever surface in notification payloads.
    expect(JSON.stringify(tnNotifs)).not.toContain('passwordHash');
    expect(JSON.stringify(tnNotifs)).not.toContain('event_key');
  });
});
