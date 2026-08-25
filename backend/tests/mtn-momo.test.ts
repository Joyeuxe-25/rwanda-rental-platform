import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveMtnProvider } from '../src/services/payment-providers/mtn-momo';
import { loadMtnConfig } from '../src/services/payment-providers/mtn-momo/mtn-momo.config';
import type { Bindings } from '../src/types';
import {
  app,
  cookie,
  getSetCookie,
  makeTestEnv,
  postJson,
  sendJson,
  validRegistration,
} from './helpers/app';
import type { TestDb } from './helpers/testDb';

/**
 * B10 MTN MoMo tests. Real HTTP application path (route → controller → payment
 * service → MTN provider → MTN client → global fetch), with `fetch` STUBBED to
 * simulate MTN — no real MTN account/credentials/network. Webhooks drive the
 * real B9 pipeline through the real MTN webhook adapter.
 */
async function json(res: Response): Promise<any> {
  return res.json();
}
const patch = (p: string, b: unknown, env: Bindings, c?: string) => sendJson('PATCH', p, b, env, c);

// --- Test MTN config (placeholder secrets — never real) ---------------------
const MTN = {
  MTN_MOMO_BASE_URL: 'https://sandbox.mtn.test',
  MTN_MOMO_SUBSCRIPTION_KEY: 'SUB_KEY_SECRET_do_not_log',
  MTN_MOMO_API_USER: 'api-user-uuid-1234',
  MTN_MOMO_API_KEY: 'API_KEY_SECRET_do_not_log',
  MTN_MOMO_TARGET_ENVIRONMENT: 'sandbox',
  MTN_MOMO_CALLBACK_TOKEN: 'CALLBACK_SECRET_TOKEN_abc',
} as const;

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface MtnScenario {
  token?: () => Response;
  requestToPay?: (init: RequestInit) => Response;
  status?: (ref: string) => Response;
}
interface Captured {
  url: string;
  headers: Record<string, string>;
  body: any;
}
/** Stub global fetch to simulate MTN; returns the captured requesttopay calls. */
function installMtn(scenario: MtnScenario = {}): { calls: Captured[] } {
  const calls: Captured[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const u = String(url);
      const headers = (init.headers ?? {}) as Record<string, string>;
      if (u.endsWith('/collection/token/')) {
        return scenario.token
          ? scenario.token()
          : jsonRes({ access_token: 'access-tok', expires_in: 3600 });
      }
      if (u.endsWith('/collection/v1_0/requesttopay')) {
        calls.push({ url: u, headers, body: init.body ? JSON.parse(String(init.body)) : null });
        return scenario.requestToPay
          ? scenario.requestToPay(init)
          : new Response(null, { status: 202 });
      }
      const m = u.match(/requesttopay\/([^/?]+)$/);
      if (m) {
        return scenario.status
          ? scenario.status(m[1]!)
          : jsonRes({ status: 'PENDING', amount: '200000', currency: 'RWF', externalId: m[1] });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  return { calls };
}
afterEach(() => vi.unstubAllGlobals());

function mtnEnv(overrides: Record<string, string> = {}): { env: Bindings; db: TestDb } {
  const { env, db } = makeTestEnv();
  Object.assign(env, MTN, overrides);
  return { env, db };
}

// --- setup helpers ----------------------------------------------------------
let seq = 0;
async function landlord(env: Bindings) {
  seq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'LANDLORD', email: `ll${seq}@ex.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function tenant(env: Bindings, phone?: string) {
  seq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'TENANT', email: `tn${seq}@ex.rw`, ...(phone ? { phone } : {}) }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function activeRental(env: Bindings, tenantPhone?: string) {
  const ll = await landlord(env);
  const pr = await postJson(
    '/api/v1/properties',
    {
      title: 'H',
      description: 'd',
      propertyType: 'HOUSE',
      monthlyRent: 200000,
      province: 'Kigali',
      district: 'Gasabo',
      sector: 'Remera',
    },
    env,
    cookie(ll.token),
  );
  const pid = (await json(pr)).data.property.id;
  await patch(`/api/v1/properties/mine/${pid}/publish`, {}, env, cookie(ll.token));
  const tn = await tenant(env, tenantPhone);
  const rr = (
    await json(
      await postJson('/api/v1/rental-requests', { propertyId: pid }, env, cookie(tn.token)),
    )
  ).data.rentalRequest;
  await patch(`/api/v1/rental-requests/landlord/${rr.id}/approve`, {}, env, cookie(ll.token));
  const rental = (
    await json(await postJson(`/api/v1/rentals/from-request/${rr.id}`, {}, env, cookie(tn.token)))
  ).data.rental;
  return { ll, tn, pid, rentalId: rental.id as string };
}

let keyN = 0;
const newKey = () => `mtn-key-${(keyN += 1)}-${Math.random().toString(36).slice(2, 8)}`;

function createPay(
  env: Bindings,
  token: string,
  rentalId: string,
  key: string,
  over: Record<string, unknown> = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Cookie'] = cookie(token);
  headers['Idempotency-Key'] = key;
  const body = {
    rentalId,
    amount: 200000,
    paymentPeriod: '2026-08',
    provider: 'MTN_MOMO',
    ...over,
  };
  return app.request(
    '/api/v1/payments',
    { method: 'POST', headers, body: JSON.stringify(body) },
    env,
  );
}
function sendWebhook(env: Bindings, body: unknown, authToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken !== undefined) headers['Authorization'] = `Bearer ${authToken}`;
  return app.request(
    '/api/v1/payment-webhooks/MTN_MOMO',
    { method: 'POST', headers, body: JSON.stringify(body) },
    env,
  );
}
function paymentStatus(db: TestDb, id: string): string {
  return (db.prepare('SELECT status FROM payments WHERE id = ?').get(id) as { status: string })
    .status;
}

// --- CONFIGURATION ----------------------------------------------------------

describe('MTN configuration', () => {
  it('when MTN is NOT configured, payment creation stays PENDING and calls no provider', async () => {
    const { calls } = installMtn();
    const { env } = makeTestEnv(); // no MTN config
    const { tn, rentalId } = await activeRental(env);
    const res = await createPay(env, tn.token, rentalId, newKey());
    expect(res.status).toBe(201);
    const p = (await json(res)).data.payment;
    expect(p.status).toBe('PENDING');
    expect(p.providerTransactionId).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('sandbox config initiates; production config in a dev/test env FAILS SAFE (500)', async () => {
    installMtn();
    const { env } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    expect((await createPay(env, tn.token, rentalId, newKey())).status).toBe(201); // sandbox ok

    const prod = mtnEnv({ MTN_MOMO_TARGET_ENVIRONMENT: 'production' });
    const r2 = await activeRental(prod.env);
    const res = await createPay(prod.env, r2.tn.token, r2.rentalId, newKey());
    expect(res.status).toBe(500);
    expect((await json(res)).error.code).toBe('MTN_UNSAFE_ENVIRONMENT');
  });

  it('a Rwanda production target (mtnrwanda) in a dev/test env FAILS SAFE (500)', async () => {
    // Regression: MTN production X-Target-Environment is a country id (mtnrwanda),
    // NOT the literal "production" — a dev build must refuse it too.
    installMtn();
    const { env } = mtnEnv({ MTN_MOMO_TARGET_ENVIRONMENT: 'mtnrwanda' });
    const { tn, rentalId } = await activeRental(env);
    const res = await createPay(env, tn.token, rentalId, newKey());
    expect(res.status).toBe(500);
    expect((await json(res)).error.code).toBe('MTN_UNSAFE_ENVIRONMENT');
  });

  it('target-environment allow-list: only sandbox in dev; any target allowed in production', () => {
    const base = makeTestEnv().env;
    const withMtn = (over: Record<string, string>) =>
      Object.assign({ ...base }, MTN, over) as Bindings;
    const codeOf = (fn: () => unknown): string | undefined => {
      try {
        fn();
        return undefined;
      } catch (e) {
        return (e as { code?: string }).code;
      }
    };

    // dev/test: sandbox OK, anything else refused.
    expect(
      loadMtnConfig(withMtn({ ENVIRONMENT: 'test', MTN_MOMO_TARGET_ENVIRONMENT: 'sandbox' }))!
        .targetEnvironment,
    ).toBe('sandbox');
    expect(
      codeOf(() =>
        loadMtnConfig(
          withMtn({ ENVIRONMENT: 'development', MTN_MOMO_TARGET_ENVIRONMENT: 'mtnrwanda' }),
        ),
      ),
    ).toBe('MTN_UNSAFE_ENVIRONMENT');
    expect(
      codeOf(() =>
        loadMtnConfig(withMtn({ ENVIRONMENT: 'test', MTN_MOMO_TARGET_ENVIRONMENT: 'production' })),
      ),
    ).toBe('MTN_UNSAFE_ENVIRONMENT');

    // production: the real Rwanda target is accepted.
    const prodCfg = loadMtnConfig(
      withMtn({ ENVIRONMENT: 'production', MTN_MOMO_TARGET_ENVIRONMENT: 'mtnrwanda' }),
    );
    expect(prodCfg!.targetEnvironment).toBe('mtnrwanda');

    // MTN inactive when core credentials are missing (no throw, returns null).
    expect(loadMtnConfig(base)).toBeNull();
  });
});

// --- INITIATION -------------------------------------------------------------

describe('MTN initiation', () => {
  it('initiates request-to-pay, stays PENDING, stores a stable reference, uses the tenant phone', async () => {
    const { calls } = installMtn();
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env, '+250788123456');
    const res = await createPay(env, tn.token, rentalId, newKey());
    expect(res.status).toBe(201);
    const p = (await json(res)).data.payment;
    expect(p.status).toBe('PENDING'); // 202 must NOT mark SUCCESSFUL
    expect(p.providerTransactionId).toBeTruthy();
    expect(paymentStatus(db, p.id)).toBe('PENDING');

    // The MTN request used the authenticated tenant's MSISDN and our reference.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers['X-Reference-Id']).toBe(p.providerTransactionId);
    expect(calls[0]!.headers['X-Target-Environment']).toBe('sandbox');
    expect(calls[0]!.body.payer).toEqual({ partyIdType: 'MSISDN', partyId: '250788123456' });
    expect(calls[0]!.body.externalId).toBe(p.providerTransactionId);
    expect(calls[0]!.body.amount).toBe('200000');
  });

  it('rejects client-supplied payer phone / amount / ids (422) — no MTN call', async () => {
    const { calls } = installMtn();
    const { env } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    for (const over of [
      { payerPhone: '+250700000000' },
      { msisdn: 'x' },
      { tenantId: 'x' },
      { status: 'SUCCESSFUL' },
      { providerTransactionId: 'x' },
    ]) {
      const res = await createPay(env, tn.token, rentalId, newKey(), over);
      expect(res.status, JSON.stringify(over)).toBe(422);
    }
    expect(calls).toHaveLength(0);
  });
});

// --- IDEMPOTENCY ------------------------------------------------------------

describe('MTN idempotency', () => {
  it('same key → one internal payment and the SAME MTN reference (no double charge)', async () => {
    const { calls } = installMtn({ requestToPay: () => new Response(null, { status: 202 }) });
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const key = newKey();
    const first = await createPay(env, tn.token, rentalId, key);
    const second = await createPay(env, tn.token, rentalId, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const p1 = (await json(first)).data.payment;
    const p2 = (await json(second)).data.payment;
    expect(p2.id).toBe(p1.id);
    const count = db
      .prepare('SELECT COUNT(*) AS c FROM payments WHERE idempotency_key = ?')
      .get(key) as { c: number };
    expect(count.c).toBe(1);
    // Both initiations carried the SAME X-Reference-Id → MTN dedupes them.
    expect(new Set(calls.map((c) => c.headers['X-Reference-Id'])).size).toBe(1);
  });

  it('same key + different amount → 409, no new MTN call', async () => {
    installMtn();
    const { env } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const key = newKey();
    await createPay(env, tn.token, rentalId, key);
    const res = await createPay(env, tn.token, rentalId, key, { amount: 150000 });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

// --- ERRORS -----------------------------------------------------------------

describe('MTN error handling (safe mapping)', () => {
  const cases: { name: string; scenario: MtnScenario; code: string; status: number }[] = [
    {
      name: '4xx',
      scenario: { requestToPay: () => new Response('bad', { status: 400 }) },
      code: 'PAYMENT_PROVIDER_ERROR',
      status: 502,
    },
    {
      name: '5xx',
      scenario: { requestToPay: () => new Response('err', { status: 503 }) },
      code: 'PAYMENT_PROVIDER_ERROR',
      status: 502,
    },
    {
      name: 'auth',
      scenario: { requestToPay: () => new Response('no', { status: 401 }) },
      code: 'PAYMENT_PROVIDER_ERROR',
      status: 502,
    },
    {
      name: 'malformed token',
      scenario: { token: () => jsonRes({}) },
      code: 'PAYMENT_PROVIDER_ERROR',
      status: 502,
    },
  ];
  for (const c of cases) {
    it(`maps ${c.name} to a safe error (no provider details leaked)`, async () => {
      installMtn(c.scenario);
      const { env } = mtnEnv();
      const { tn, rentalId } = await activeRental(env);
      const res = await createPay(env, tn.token, rentalId, newKey());
      expect(res.status).toBe(c.status);
      const body = await json(res);
      expect(body.error.code).toBe(c.code);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain(MTN.MTN_MOMO_SUBSCRIPTION_KEY);
      expect(raw).not.toContain(MTN.MTN_MOMO_API_KEY);
    });
  }

  it('times out safely (504)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.endsWith('/collection/token/'))
          return jsonRes({ access_token: 'tok', expires_in: 3600 });
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }),
    );
    const { env } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const res = await createPay(env, tn.token, rentalId, newKey());
    expect(res.status).toBe(504);
    expect((await json(res)).error.code).toBe('PAYMENT_PROVIDER_TIMEOUT');
  });
});

// --- WEBHOOK ----------------------------------------------------------------

async function initiatedPayment(env: Bindings, tn: { token: string }, rentalId: string) {
  const res = await createPay(env, tn.token, rentalId, newKey());
  return (await json(res)).data.payment;
}

describe('MTN webhook (via the B9 pipeline + real MTN adapter)', () => {
  it('valid SUCCESS callback → SUCCESSFUL; persists a provider event', async () => {
    installMtn();
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const p = await initiatedPayment(env, tn, rentalId);
    const res = await sendWebhook(
      env,
      {
        externalId: p.providerTransactionId,
        status: 'SUCCESSFUL',
        amount: '200000',
        currency: 'RWF',
        financialTransactionId: 'FT-1',
      },
      MTN.MTN_MOMO_CALLBACK_TOKEN,
    );
    expect(res.status).toBe(200);
    expect(paymentStatus(db, p.id)).toBe('SUCCESSFUL');
    const ev = db
      .prepare(
        'SELECT processing_status, payment_id FROM payment_provider_events WHERE external_transaction_id = ?',
      )
      .get(p.providerTransactionId) as any;
    expect(ev.processing_status).toBe('PROCESSED');
    expect(ev.payment_id).toBe(p.id);
  });

  it('valid FAILED callback → FAILED', async () => {
    installMtn();
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const p = await initiatedPayment(env, tn, rentalId);
    await sendWebhook(
      env,
      { externalId: p.providerTransactionId, status: 'FAILED', financialTransactionId: 'FT-2' },
      MTN.MTN_MOMO_CALLBACK_TOKEN,
    );
    expect(paymentStatus(db, p.id)).toBe('FAILED');
  });

  it('invalid/missing callback auth → 401, payment unchanged', async () => {
    installMtn();
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const p = await initiatedPayment(env, tn, rentalId);
    expect(
      (
        await sendWebhook(
          env,
          { externalId: p.providerTransactionId, status: 'SUCCESSFUL' },
          'WRONG',
        )
      ).status,
    ).toBe(401);
    expect(
      (await sendWebhook(env, { externalId: p.providerTransactionId, status: 'SUCCESSFUL' }))
        .status,
    ).toBe(401);
    expect(paymentStatus(db, p.id)).toBe('PENDING');
  });

  it('duplicate callback is idempotent', async () => {
    installMtn();
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const p = await initiatedPayment(env, tn, rentalId);
    const body = {
      externalId: p.providerTransactionId,
      status: 'SUCCESSFUL',
      amount: '200000',
      currency: 'RWF',
      financialTransactionId: 'FT-3',
    };
    expect((await sendWebhook(env, body, MTN.MTN_MOMO_CALLBACK_TOKEN)).status).toBe(200);
    expect((await sendWebhook(env, body, MTN.MTN_MOMO_CALLBACK_TOKEN)).status).toBe(200); // idempotent
    expect(paymentStatus(db, p.id)).toBe('SUCCESSFUL');
    const c = db.prepare('SELECT COUNT(*) AS c FROM payment_provider_events').get() as {
      c: number;
    };
    expect(c.c).toBe(1);
  });

  it('unknown transaction → UNMATCHED (ack, no payment change)', async () => {
    installMtn();
    const { env, db } = mtnEnv();
    await activeRental(env);
    const res = await sendWebhook(
      env,
      { externalId: 'unknown-ref', status: 'SUCCESSFUL', financialTransactionId: 'FT-4' },
      MTN.MTN_MOMO_CALLBACK_TOKEN,
    );
    expect(res.status).toBe(200);
    const ev = db
      .prepare(
        "SELECT processing_status FROM payment_provider_events WHERE external_transaction_id = 'unknown-ref'",
      )
      .get() as any;
    expect(ev.processing_status).toBe('UNMATCHED');
  });

  it('amount / currency mismatch does NOT mark SUCCESSFUL', async () => {
    installMtn();
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const p = await initiatedPayment(env, tn, rentalId);
    await sendWebhook(
      env,
      {
        externalId: p.providerTransactionId,
        status: 'SUCCESSFUL',
        amount: '999999',
        currency: 'RWF',
        financialTransactionId: 'FT-5',
      },
      MTN.MTN_MOMO_CALLBACK_TOKEN,
    );
    expect(paymentStatus(db, p.id)).toBe('PENDING');

    const p2 = await initiatedPayment(env, tn, rentalId); // new payment (same rental, new key)
    // Note: same rental can have multiple payments; test currency mismatch on a fresh one.
    await sendWebhook(
      env,
      {
        externalId: p2.providerTransactionId,
        status: 'SUCCESSFUL',
        amount: '200000',
        currency: 'USD',
        financialTransactionId: 'FT-6',
      },
      MTN.MTN_MOMO_CALLBACK_TOKEN,
    );
    expect(paymentStatus(db, p2.id)).toBe('PENDING');
  });

  it('terminal payment is not overwritten by a conflicting callback', async () => {
    installMtn();
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const p = await initiatedPayment(env, tn, rentalId);
    await sendWebhook(
      env,
      {
        externalId: p.providerTransactionId,
        status: 'SUCCESSFUL',
        amount: '200000',
        currency: 'RWF',
        financialTransactionId: 'FT-7',
      },
      MTN.MTN_MOMO_CALLBACK_TOKEN,
    );
    expect(paymentStatus(db, p.id)).toBe('SUCCESSFUL');
    // A later conflicting FAILED must not reopen it.
    await sendWebhook(
      env,
      { externalId: p.providerTransactionId, status: 'FAILED', financialTransactionId: 'FT-8' },
      MTN.MTN_MOMO_CALLBACK_TOKEN,
    );
    expect(paymentStatus(db, p.id)).toBe('SUCCESSFUL');
  });
});

// --- STATUS LOOKUP ----------------------------------------------------------

describe('MTN status lookup (provider.checkStatus)', () => {
  it('maps PENDING/SUCCESSFUL/FAILED correctly', async () => {
    for (const [mtn, internal] of [
      ['PENDING', 'PENDING'],
      ['SUCCESSFUL', 'SUCCESSFUL'],
      ['FAILED', 'FAILED'],
    ] as const) {
      installMtn({
        status: () =>
          jsonRes({
            status: mtn,
            amount: '200000',
            currency: 'RWF',
            externalId: 'ref-1',
            financialTransactionId: 'FT',
          }),
      });
      const { env } = mtnEnv();
      const provider = resolveMtnProvider(env)!;
      const result = await provider.checkStatus('ref-1');
      expect(result.status).toBe(internal);
      vi.unstubAllGlobals();
    }
  });
});

// --- SECURITY ---------------------------------------------------------------

describe('MTN security', () => {
  afterEach(() => vi.restoreAllMocks());
  it('no client can force SUCCESSFUL; no credentials/tokens in logs', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) =>
        logs.push(a.map(String).join(' ')),
      );
    }
    installMtn();
    const { env, db } = mtnEnv();
    const { tn, rentalId } = await activeRental(env);
    const p = await initiatedPayment(env, tn, rentalId);
    // No status-mutation endpoint exists.
    expect(
      (await patch(`/api/v1/payments/${p.id}`, { status: 'SUCCESSFUL' }, env, cookie(tn.token)))
        .status,
    ).toBe(404);
    expect(paymentStatus(db, p.id)).toBe('PENDING');

    const blob = logs.join('\n');
    expect(blob).not.toContain(MTN.MTN_MOMO_SUBSCRIPTION_KEY);
    expect(blob).not.toContain(MTN.MTN_MOMO_API_KEY);
    expect(blob).not.toContain('access-tok');
    expect(blob).not.toContain(MTN.MTN_MOMO_CALLBACK_TOKEN);
    expect(blob).not.toContain('pbkdf2$');
  });
});
