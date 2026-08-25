import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { getDb } from '../src/db/client';
import * as paymentService from '../src/services/payment.service';
import { loadMtnConfig } from '../src/services/payment-providers/mtn-momo/mtn-momo.config';
import {
  clearWebhookAdapters,
  registerWebhookAdapter,
} from '../src/services/payment-providers/registry';
import type {
  NormalizedWebhookEvent,
  PaymentWebhookAdapter,
  WebhookVerificationContext,
} from '../src/types/payment';
import type { Bindings } from '../src/types';
import {
  app,
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
import { ApiError } from '../src/utils/ApiError';
import type { TestDb } from './helpers/testDb';

/**
 * B13 consolidated security suite. Exercises the REAL HTTP path (route → auth →
 * role → validation → controller → service → repository → D1/R2 shims), plus a
 * few internal service seams that have no HTTP endpoint (payment status). These
 * assertions encode the security invariants of B0–B12; they must never be
 * weakened to obtain a passing build.
 *
 * A TEST-ONLY webhook adapter is registered at runtime (the production registry
 * is empty by default), so no test code ever ships in production behavior.
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
    validRegistration({ role: 'LANDLORD', email: `sec-ll${seq}@example.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function tenant(env: Bindings) {
  seq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'TENANT', email: `sec-tn${seq}@example.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function property(env: Bindings, token: string): Promise<string> {
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
  await patch(`/api/v1/properties/mine/${id}/publish`, {}, env, cookie(token));
  return id;
}

let keyN = 0;
function newKey(): string {
  keyN += 1;
  return `sec-key-${keyN}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Create a fully ACTIVE rental and a PENDING payment for it (monthlyRent 200000). */
async function activeRentalWithPayment(env: Bindings, db: TestDb, txn: string | null = null) {
  const ll = await landlord(env);
  const pid = await property(env, ll.token);
  const tn = await tenant(env);
  const rr = (
    await json(
      await postJson('/api/v1/rental-requests', { propertyId: pid }, env, cookie(tn.token)),
    )
  ).data.rentalRequest;
  await patch(`/api/v1/rental-requests/landlord/${rr.id}/approve`, {}, env, cookie(ll.token));
  const rental = (
    await json(await postJson(`/api/v1/rentals/from-request/${rr.id}`, {}, env, cookie(tn.token)))
  ).data.rental;
  const created = (
    await json(
      await app.request(
        '/api/v1/payments',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie(tn.token),
            'Idempotency-Key': newKey(),
          },
          body: JSON.stringify({
            rentalId: rental.id,
            amount: 200000,
            paymentPeriod: '2026-08',
            provider: 'MTN_MOMO',
          }),
        },
        env,
      ),
    )
  ).data.payment;
  if (txn)
    db.prepare('UPDATE payments SET provider_transaction_id = ? WHERE id = ?').run(txn, created.id);
  return { ll, tn, pid, rentalId: rental.id as string, paymentId: created.id as string };
}

// --- Test-only webhook adapter (auth = a shared "signature" header) ----------
const testAdapter: PaymentWebhookAdapter = {
  name: 'MTN_MOMO',
  async verify(ctx: WebhookVerificationContext): Promise<boolean> {
    return ctx.headers['x-test-signature'] === 'valid';
  },
  normalize(ctx: WebhookVerificationContext): NormalizedWebhookEvent {
    const b = JSON.parse(ctx.rawBody) as Record<string, unknown>;
    if (typeof b.status !== 'string') throw new Error('malformed');
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
  registerWebhookAdapter(testAdapter); // AIRTEL_MONEY intentionally NOT registered
});

async function webhook(
  env: Bindings,
  provider: string,
  body: unknown,
  signature: string | null = 'valid',
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== null) headers['X-Test-Signature'] = signature;
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return app.request(
    `/api/v1/payment-webhooks/${provider}`,
    { method: 'POST', headers, body: raw },
    env,
  );
}
function payStatus(db: TestDb, id: string): string {
  return (db.prepare('SELECT status FROM payments WHERE id = ?').get(id) as { status: string })
    .status;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// 1–4. IDOR & cross-role route access
// ============================================================================
describe('IDOR & authorization', () => {
  it('1. IDOR across tenants: tenant B cannot read tenant A’s payment (404, no leak)', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await activeRentalWithPayment(env, db);
    const intruder = await tenant(env);
    const res = await get(`/api/v1/payments/mine/${paymentId}`, env, cookie(intruder.token));
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('2. IDOR across landlords: landlord B cannot read/modify landlord A’s property (404)', async () => {
    const { env } = makeTestEnv();
    const a = await landlord(env);
    const pid = await property(env, a.token);
    const b = await landlord(env);
    expect((await get(`/api/v1/properties/mine/${pid}`, env, cookie(b.token))).status).toBe(404);
    expect(
      (await patch(`/api/v1/properties/mine/${pid}`, { title: 'hijacked' }, env, cookie(b.token)))
        .status,
    ).toBe(404);
    expect((await del(`/api/v1/properties/mine/${pid}`, env, cookie(b.token))).status).toBe(404);
  });

  it('3. tenant cannot reach landlord-only routes (403)', async () => {
    const { env } = makeTestEnv();
    const tn = await tenant(env);
    const res = await postJson(
      '/api/v1/properties',
      {
        title: 'x',
        propertyType: 'HOUSE',
        monthlyRent: 1,
        province: 'K',
        district: 'G',
        sector: 'R',
      },
      env,
      cookie(tn.token),
    );
    expect(res.status).toBe(403);
    expect((await get('/api/v1/payments/landlord', env, cookie(tn.token))).status).toBe(403);
  });

  it('4. landlord cannot reach tenant-only routes (403)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    expect((await get('/api/v1/payments/mine', env, cookie(ll.token))).status).toBe(403);
    const res = await app.request(
      '/api/v1/payments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie(ll.token),
          'Idempotency-Key': newKey(),
        },
        body: JSON.stringify({
          rentalId: 'x',
          amount: 1,
          paymentPeriod: '2026-08',
          provider: 'MTN_MOMO',
        }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it('unauthenticated access to a private route is 401', async () => {
    const { env } = makeTestEnv();
    expect((await get('/api/v1/users/me', env)).status).toBe(401);
    expect((await get('/api/v1/notifications', env)).status).toBe(401);
  });
});

// ============================================================================
// 5–8. Mass assignment, role escalation, status/payment-success manipulation
// ============================================================================
describe('mass-assignment & privilege', () => {
  it('5. property update rejects server-controlled fields (422, strict schema)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const res = await patch(
      `/api/v1/properties/mine/${pid}`,
      { title: 'ok', landlordId: 'someone-else', isPublished: true, status: 'OCCUPIED' },
      env,
      cookie(ll.token),
    );
    expect(res.status).toBe(422);
  });

  it('6. role escalation via profile update is rejected (422); role never changes', async () => {
    const { env } = makeTestEnv();
    const tn = await tenant(env);
    const res = await patch('/api/v1/users/me', { role: 'LANDLORD' }, env, cookie(tn.token));
    expect(res.status).toBe(422);
    const me = await json(await get('/api/v1/users/me', env, cookie(tn.token)));
    expect(me.data.user.role).toBe('TENANT');
  });

  it('7/8. client cannot inject payment status / provider txn id / ownership', async () => {
    const { env, db } = makeTestEnv();
    const { rentalId, tn } = await activeRentalWithPayment(env, db);
    const res = await app.request(
      '/api/v1/payments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie(tn.token),
          'Idempotency-Key': newKey(),
        },
        body: JSON.stringify({
          rentalId,
          amount: 100000,
          paymentPeriod: '2026-09',
          provider: 'MTN_MOMO',
          status: 'SUCCESSFUL',
          providerTransactionId: 'attacker-supplied',
          tenantId: 'someone-else',
        }),
      },
      env,
    );
    expect(res.status).toBe(422); // strict schema rejects unknown keys
  });

  it('8b. there is NO HTTP endpoint to mark a payment SUCCESSFUL', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId, tn } = await activeRentalWithPayment(env, db);
    // No route mutates status; the closest owned route is read-only.
    for (const method of ['PATCH', 'POST', 'PUT'] as const) {
      const res = await sendJson(
        method,
        `/api/v1/payments/mine/${paymentId}`,
        { status: 'SUCCESSFUL' },
        env,
        cookie(tn.token),
      );
      expect(res.status).toBe(404); // no such route/method
    }
    expect(payStatus(db, paymentId)).toBe('PENDING');
  });
});

// ============================================================================
// 9–11, 25. Webhook forgery/replay, duplicate payment, terminal-state overwrite
// ============================================================================
describe('payment & webhook integrity', () => {
  const okEvent = (over: Record<string, unknown> = {}) => ({
    externalEventId: 'sec-evt-1',
    externalTransactionId: 'SEC-TX-1',
    status: 'SUCCESSFUL',
    amount: 200000,
    currency: 'RWF',
    ...over,
  });

  it('9. forged webhook (bad/missing signature) is rejected (401) and never mutates state', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await activeRentalWithPayment(env, db, 'SEC-TX-1');
    expect((await webhook(env, 'MTN_MOMO', okEvent(), 'invalid')).status).toBe(401);
    expect((await webhook(env, 'MTN_MOMO', okEvent(), null)).status).toBe(401);
    expect(payStatus(db, paymentId)).toBe('PENDING');
    // A forged delivery is NOT persisted (no DB-flooding vector).
    expect((db.prepare('SELECT COUNT(*) c FROM payment_provider_events').get() as any).c).toBe(0);
  });

  it('10. webhook replay is idempotent: a re-delivered event transitions once', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await activeRentalWithPayment(env, db, 'SEC-TX-1');
    expect((await webhook(env, 'MTN_MOMO', okEvent())).status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('SUCCESSFUL');
    const replay = await webhook(env, 'MTN_MOMO', okEvent());
    expect(replay.status).toBe(200);
    expect((await json(replay)).data.received).toBe(true);
    expect((db.prepare('SELECT COUNT(*) c FROM payment_provider_events').get() as any).c).toBe(1);
  });

  it('amount mismatch is recorded and never marks success', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await activeRentalWithPayment(env, db, 'SEC-TX-1');
    const res = await webhook(env, 'MTN_MOMO', okEvent({ amount: 999999 }));
    expect(res.status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('PENDING');
  });

  it('11. duplicate payment: reusing an Idempotency-Key returns the same payment (one row)', async () => {
    const { env, db } = makeTestEnv();
    const { rentalId, tn } = await activeRentalWithPayment(env, db);
    const key = newKey();
    const body = JSON.stringify({
      rentalId,
      amount: 50000,
      paymentPeriod: '2026-10',
      provider: 'MTN_MOMO',
    });
    const mk = () =>
      app.request(
        '/api/v1/payments',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie(tn.token),
            'Idempotency-Key': key,
          },
          body,
        },
        env,
      );
    const first = await mk();
    const second = await mk();
    expect(first.status).toBe(201);
    expect(second.status).toBe(200); // idempotent replay
    const id1 = (await json(first)).data.payment.id;
    const id2 = (await json(second)).data.payment.id;
    expect(id1).toBe(id2);
    const count = (
      db.prepare('SELECT COUNT(*) c FROM payments WHERE idempotency_key = ?').get(key) as any
    ).c;
    expect(count).toBe(1);
  });

  it('25. terminal state cannot be overwritten (SUCCESSFUL → FAILED rejected)', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await activeRentalWithPayment(env, db, 'SEC-TX-1');
    await paymentService.applyProviderStatus(getDb(env), paymentId, 'SUCCESSFUL');
    await expect(
      paymentService.applyProviderStatus(getDb(env), paymentId, 'FAILED'),
    ).rejects.toMatchObject({ code: 'PAYMENT_ALREADY_COMPLETED' });
    // Via webhook too: a later FAILED delivery is acknowledged but recorded as a conflict.
    const res = await webhook(
      env,
      'MTN_MOMO',
      okEvent({ status: 'FAILED', externalEventId: 'sec-evt-2' }),
    );
    expect(res.status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('SUCCESSFUL');
  });

  it('unsupported provider (400) / not-implemented provider (501) — no dynamic dispatch', async () => {
    const { env } = makeTestEnv();
    expect((await webhook(env, 'PAYPAL', okEvent())).status).toBe(400);
    const airtel = await webhook(env, 'AIRTEL_MONEY', okEvent());
    expect(airtel.status).toBe(501);
    expect((await json(airtel)).error.code).toBe('WEBHOOK_PROVIDER_NOT_IMPLEMENTED');
  });
});

// ============================================================================
// 12, 21. Notification dedup & cross-user access
// ============================================================================
describe('notification privacy', () => {
  it('12. duplicate business event yields a single notification (event_key dedup)', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId, tn } = await activeRentalWithPayment(env, db, 'SEC-TX-1');
    // Two SUCCESSFUL transitions collapse to one (idempotent) → one tenant notification.
    await paymentService.applyProviderStatus(getDb(env), paymentId, 'SUCCESSFUL');
    await paymentService.applyProviderStatus(getDb(env), paymentId, 'SUCCESSFUL');
    const list = await json(
      await get('/api/v1/notifications?type=PAYMENT_SUCCESSFUL', env, cookie(tn.token)),
    );
    expect(list.data.notifications.length).toBe(1);
  });

  it('21. cross-user notification access is 404; ?userId is ignored', async () => {
    const { env, db } = makeTestEnv();
    const { tn } = await activeRentalWithPayment(env, db);
    const mine = await json(await get('/api/v1/notifications', env, cookie(tn.token)));
    const notifId = mine.data.notifications[0].id as string;
    const intruder = await tenant(env);
    expect(
      (await get(`/api/v1/notifications/${notifId}`, env, cookie(intruder.token))).status,
    ).toBe(404);
    // Spoofed ?userId must be ignored (ownership is session-derived).
    const spoof = await json(
      await get(`/api/v1/notifications?userId=${tn.user.id}`, env, cookie(intruder.token)),
    );
    expect(spoof.data.notifications.length).toBe(0);
  });
});

// ============================================================================
// 13–17. Input bounds, oversized body, image upload security, R2 traversal
// ============================================================================
describe('input & upload security', () => {
  it('13. malformed pagination is rejected (422)', async () => {
    const { env } = makeTestEnv();
    const tn = await tenant(env);
    expect((await get('/api/v1/notifications?page=0', env, cookie(tn.token))).status).toBe(422);
    expect((await get('/api/v1/notifications?limit=9999', env, cookie(tn.token))).status).toBe(422);
    expect((await get('/api/v1/notifications?type=NONSENSE', env, cookie(tn.token))).status).toBe(
      422,
    );
  });

  it('14. oversized field is rejected by the validator (422)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const res = await postJson(
      '/api/v1/properties',
      {
        title: 'ok',
        description: 'x'.repeat(5001), // max 5000
        propertyType: 'HOUSE',
        monthlyRent: 1,
        province: 'K',
        district: 'G',
        sector: 'R',
      },
      env,
      cookie(ll.token),
    );
    expect(res.status).toBe(422);
  });

  it('15. oversized image is rejected (413)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff, 0xe0], 0); // valid JPEG magic
    const res = await uploadImage(env, pid, ll.token, { bytes: big, filename: 'big.jpg' });
    expect(res.status).toBe(413);
  });

  it('16. non-image / SVG bytes are rejected by magic-byte sniffing (415)', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    expect((await uploadImage(env, pid, ll.token, { bytes: gif, filename: 'x.gif' })).status).toBe(
      415,
    );
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect((await uploadImage(env, pid, ll.token, { bytes: svg, filename: 'x.svg' })).status).toBe(
      415,
    );
  });

  it('17. path-traversal filename cannot escape the property R2 prefix', async () => {
    const { env, r2 } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await property(env, ll.token);
    const res = await uploadImage(env, pid, ll.token, {
      bytes: fakeImageBytes('jpeg'),
      filename: '../../../../etc/passwd.jpg',
    });
    expect(res.status).toBe(201);
    const img = (await json(res)).data.image;
    expect(img.originalName).not.toContain('/');
    expect(img.originalName).not.toContain('..');
    // Every stored R2 key is server-generated under the property's prefix.
    for (const key of r2.keys()) {
      expect(key.startsWith(`properties/${pid}/`)).toBe(true);
      expect(key).not.toContain('..');
    }
  });
});

// ============================================================================
// 18–20. Secret / hash / token leakage
// ============================================================================
describe('secret, hash & token non-disclosure', () => {
  it('19/20. auth responses never expose passwordHash or the raw session token', async () => {
    const { env } = makeTestEnv();
    const reg = validRegistration({ role: 'TENANT', email: `sec-leak${Date.now()}@example.rw` });
    const res = await postJson('/api/v1/auth/register', reg, env);
    const token = getSetCookie(res)!;
    const bodyText = JSON.stringify(await json(res));
    expect(bodyText).not.toContain('passwordHash');
    expect(bodyText).not.toContain('password_hash');
    expect(bodyText).not.toContain(reg.password);
    expect(bodyText).not.toContain(token); // raw token lives only in the HttpOnly cookie
    const me = JSON.stringify(await json(await get('/api/v1/users/me', env, cookie(token))));
    expect(me).not.toContain('passwordHash');
    expect(me).not.toContain('password_hash');
  });

  it('18. logs never contain the plaintext password or the session token', async () => {
    const { env } = makeTestEnv();
    const logs: string[] = [];
    for (const m of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      });
    }
    const reg = validRegistration({ role: 'TENANT', email: `sec-log${Date.now()}@example.rw` });
    const login = await postJson('/api/v1/auth/register', reg, env);
    const token = getSetCookie(login)!;
    await postJson('/api/v1/auth/login', { email: reg.email, password: reg.password }, env);
    const blob = logs.join('\n');
    expect(blob).not.toContain(reg.password);
    expect(blob).not.toContain(token);
    expect(blob.toLowerCase()).not.toContain('passwordhash');
  });
});

// ============================================================================
// 22. CORS
// ============================================================================
describe('CORS', () => {
  it('a disallowed origin receives NO Allow-Origin header (browser blocks the read)', async () => {
    const { env } = makeTestEnv(); // FRONTEND_URL = http://localhost:3000
    const res = await app.request(
      '/api/v1/health',
      { method: 'GET', headers: { Origin: 'https://evil.example' } },
      env,
    );
    const acao = res.headers.get('access-control-allow-origin');
    expect(acao).not.toBe('*');
    expect(acao).not.toBe('https://evil.example');
    expect(acao).toBeNull(); // exact-match only — never reflected, never wildcard
  });

  it('the configured origin is allowed, with credentials enabled', async () => {
    const { env } = makeTestEnv();
    const res = await app.request(
      '/api/v1/health',
      { method: 'GET', headers: { Origin: 'http://localhost:3000' } },
      env,
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('preflight allows the Idempotency-Key header (required for payment idempotency)', async () => {
    const { env } = makeTestEnv();
    const res = await app.request(
      '/api/v1/payments',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'idempotency-key',
        },
      },
      env,
    );
    const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(allowed).toContain('idempotency-key');
  });
});

// ============================================================================
// 23–24. Insecure environment / MTN production-target protection
// ============================================================================
describe('environment & provider safety', () => {
  const baseMtn = {
    MTN_MOMO_BASE_URL: 'https://sandbox.momodeveloper.mtn.com',
    MTN_MOMO_SUBSCRIPTION_KEY: 'k',
    MTN_MOMO_API_USER: 'u',
    MTN_MOMO_API_KEY: 'a',
  };

  it('24. a non-production build refuses a non-sandbox MTN target (mtnrwanda)', () => {
    const env = {
      ENVIRONMENT: 'development',
      ...baseMtn,
      MTN_MOMO_TARGET_ENVIRONMENT: 'mtnrwanda',
    } as unknown as Bindings;
    try {
      loadMtnConfig(env);
      throw new Error('expected loadMtnConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('MTN_UNSAFE_ENVIRONMENT');
    }
  });

  it('23. dev refuses literal "production" target too; sandbox is allowed', () => {
    const bad = {
      ENVIRONMENT: 'test',
      ...baseMtn,
      MTN_MOMO_TARGET_ENVIRONMENT: 'production',
    } as unknown as Bindings;
    expect(() => loadMtnConfig(bad)).toThrow();

    const ok = {
      ENVIRONMENT: 'development',
      ...baseMtn,
      MTN_MOMO_TARGET_ENVIRONMENT: 'sandbox',
    } as unknown as Bindings;
    expect(loadMtnConfig(ok)?.targetEnvironment).toBe('sandbox');
  });

  it('MTN is INACTIVE (null) when credentials are absent — no accidental live calls', () => {
    const env = { ENVIRONMENT: 'production' } as unknown as Bindings;
    expect(loadMtnConfig(env)).toBeNull();
  });
});
