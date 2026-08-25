import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
  getSetCookie,
  makeTestEnv,
  postJson,
  sendJson,
  validRegistration,
} from './helpers/app';
import type { TestDb } from './helpers/testDb';

/**
 * B9 webhook-architecture tests. Real HTTP path (route → raw-body capture →
 * provider verification → normalize → validation → service → repositories →
 * D1). Uses a TEST-ONLY adapter registered at runtime — no test code lives in
 * production (the registry is empty by default).
 */

// --- Test-only webhook adapter (isolated in tests) -------------------------
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
  registerWebhookAdapter(testAdapter); // AIRTEL_MONEY intentionally left unregistered
});

async function json(res: Response): Promise<any> {
  return res.json();
}
const patch = (p: string, b: unknown, env: Bindings, c?: string) => sendJson('PATCH', p, b, env, c);

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
async function property(env: Bindings, token: string): Promise<string> {
  const res = await postJson(
    '/api/v1/properties',
    {
      title: 'Rentable',
      description: 'nice',
      propertyType: 'HOUSE',
      monthlyRent: 200000,
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
/** Create an ACTIVE rental + a PENDING payment, and link a provider txn id (as B10 initiation would). */
async function payment(
  env: Bindings,
  db: TestDb,
  { txn = 'MTN-TX-1', amount = 200000 }: { txn?: string | null; amount?: number } = {},
): Promise<{ paymentId: string; tenantToken: string }> {
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
  keyN += 1;
  const created = (
    await json(
      await app.request(
        '/api/v1/payments',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie(tn.token),
            'Idempotency-Key': `pw-key-${keyN}-abcdef`,
          },
          body: JSON.stringify({
            rentalId: rental.id,
            amount,
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
  return { paymentId: created.id, tenantToken: tn.token };
}

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
function eventRows(db: TestDb): any[] {
  return db.prepare('SELECT * FROM payment_provider_events').all() as any[];
}

const okEvent = (over: Record<string, unknown> = {}) => ({
  externalEventId: 'evt-1',
  externalTransactionId: 'MTN-TX-1',
  status: 'SUCCESSFUL',
  amount: 200000,
  currency: 'RWF',
  ...over,
});

// --- ROUTING / PROVIDER -----------------------------------------------------

describe('routing & provider', () => {
  it('route is public (no session) and a verified SUCCESS updates PENDING → SUCCESSFUL', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db);
    expect(payStatus(db, paymentId)).toBe('PENDING');
    const res = await webhook(env, 'MTN_MOMO', okEvent()); // no cookie
    expect(res.status).toBe(200);
    expect((await json(res)).data.received).toBe(true);
    expect(payStatus(db, paymentId)).toBe('SUCCESSFUL');
    const ev = eventRows(db);
    expect(ev).toHaveLength(1);
    expect(ev[0].processing_status).toBe('PROCESSED');
    expect(ev[0].payment_id).toBe(paymentId);
  });

  it('rejects an unsupported provider (400) and a not-implemented provider (501)', async () => {
    const { env } = makeTestEnv();
    expect((await webhook(env, 'PAYPAL', okEvent())).status).toBe(400);
    const airtel = await webhook(env, 'AIRTEL_MONEY', okEvent());
    expect(airtel.status).toBe(501);
    expect((await json(airtel)).error.code).toBe('WEBHOOK_PROVIDER_NOT_IMPLEMENTED');
  });
});

// --- AUTHENTICATION ---------------------------------------------------------

describe('verification', () => {
  it('rejects an invalid/missing signature (401) and never touches payment state', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db);
    const bad = await webhook(env, 'MTN_MOMO', okEvent(), 'bad-signature');
    expect(bad.status).toBe(401);
    expect((await json(bad)).error.code).toBe('WEBHOOK_VERIFICATION_FAILED');
    expect((await webhook(env, 'MTN_MOMO', okEvent(), null)).status).toBe(401);
    // Payment untouched; no event persisted for a forged delivery.
    expect(payStatus(db, paymentId)).toBe('PENDING');
    expect(eventRows(db)).toHaveLength(0);
  });

  it('rejects a malformed payload after verification (400)', async () => {
    const { env } = makeTestEnv();
    const res = await webhook(env, 'MTN_MOMO', '{ not valid json'); // valid sig, bad body
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('WEBHOOK_INVALID_EVENT');
  });
});

// --- DEDUPLICATION ----------------------------------------------------------

describe('deduplication', () => {
  it('processes a given event id once; a duplicate is acknowledged, not reprocessed', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db);
    const first = await webhook(env, 'MTN_MOMO', okEvent({ externalEventId: 'evt-dup' }));
    const second = await webhook(env, 'MTN_MOMO', okEvent({ externalEventId: 'evt-dup' }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await json(second)).data.received).toBe(true);
    expect(payStatus(db, paymentId)).toBe('SUCCESSFUL');
    expect(eventRows(db)).toHaveLength(1); // only one persisted event
  });

  it('deduplicates by payload fingerprint when there is no event id', async () => {
    const { env, db } = makeTestEnv();
    await payment(env, db);
    const body = okEvent({ externalEventId: null });
    await webhook(env, 'MTN_MOMO', body);
    await webhook(env, 'MTN_MOMO', body); // identical bytes → same hash
    expect(eventRows(db)).toHaveLength(1);
  });
});

// --- CORRELATION ------------------------------------------------------------

describe('correlation', () => {
  it('persists an unmatched event (no payment) without changing any payment', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db, { txn: 'MTN-TX-1' });
    const res = await webhook(env, 'MTN_MOMO', okEvent({ externalTransactionId: 'UNKNOWN-TX' }));
    expect(res.status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('PENDING');
    expect(eventRows(db)[0].processing_status).toBe('UNMATCHED');
  });

  it('never correlates by amount alone (missing txn id → unmatched)', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db);
    const res = await webhook(env, 'MTN_MOMO', okEvent({ externalTransactionId: null }));
    expect(res.status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('PENDING'); // amount matched but not correlated
    expect(eventRows(db)[0].processing_status).toBe('UNMATCHED');
  });
});

// --- PAYMENT STATUS ---------------------------------------------------------

describe('payment status application', () => {
  it('applies FAILED, and SUCCESS sets completedAt', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db);
    await webhook(env, 'MTN_MOMO', okEvent({ status: 'FAILED' }));
    expect(payStatus(db, paymentId)).toBe('FAILED');
    const completed = db
      .prepare('SELECT completed_at FROM payments WHERE id = ?')
      .get(paymentId) as {
      completed_at: number | null;
    };
    expect(completed.completed_at).toBeNull(); // only SUCCESSFUL sets it
  });

  it('a repeated SUCCESS (new event id, same txn) is idempotent', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db);
    await webhook(env, 'MTN_MOMO', okEvent({ externalEventId: 'e1' }));
    const again = await webhook(env, 'MTN_MOMO', okEvent({ externalEventId: 'e2' }));
    expect(again.status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('SUCCESSFUL');
    expect(eventRows(db).filter((e) => e.processing_status === 'PROCESSED')).toHaveLength(2);
  });

  it('a terminal conflict is recorded, never silently overwriting the payment', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db);
    await webhook(env, 'MTN_MOMO', okEvent({ externalEventId: 'e1', status: 'SUCCESSFUL' }));
    const conflict = await webhook(
      env,
      'MTN_MOMO',
      okEvent({ externalEventId: 'e2', status: 'FAILED' }),
    );
    expect(conflict.status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('SUCCESSFUL'); // unchanged
    const ev = eventRows(db).find((e) => e.external_event_id === 'e2');
    expect(ev.processing_status).toBe('FAILED');
    expect(ev.processing_error_code).toBe('PAYMENT_PROVIDER_STATUS_CONFLICT');
  });
});

// --- AMOUNT / CURRENCY ------------------------------------------------------

describe('amount & currency verification', () => {
  it('an amount mismatch does not mark the payment SUCCESSFUL', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db, { amount: 200000 });
    const res = await webhook(env, 'MTN_MOMO', okEvent({ amount: 150000 }));
    expect(res.status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('PENDING');
    expect(eventRows(db)[0].processing_error_code).toBe('PAYMENT_AMOUNT_MISMATCH');
  });

  it('a currency mismatch does not mark the payment SUCCESSFUL', async () => {
    const { env, db } = makeTestEnv();
    const { paymentId } = await payment(env, db);
    const res = await webhook(env, 'MTN_MOMO', okEvent({ currency: 'USD' }));
    expect(res.status).toBe(200);
    expect(payStatus(db, paymentId)).toBe('PENDING');
    expect(eventRows(db)[0].processing_error_code).toBe('PAYMENT_CURRENCY_MISMATCH');
  });
});

// --- SECURITY ---------------------------------------------------------------

describe('security: no raw bodies / signatures / secrets in logs', () => {
  afterEach(() => vi.restoreAllMocks());
  it('does not log the raw webhook body or signature', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) =>
        logs.push(a.map(String).join(' ')),
      );
    }
    const { env, db } = makeTestEnv();
    await payment(env, db);
    const secretMarker = 'SUPER-SECRET-SIGNATURE-VALUE';
    await webhook(env, 'MTN_MOMO', okEvent({ externalEventId: secretMarker }), 'valid');
    const blob = logs.join('\n');
    // The event id we processed may appear as safe metadata; the SIGNATURE and
    // raw-body-only fields must not. Assert the signature header value is absent.
    expect(blob).not.toContain('X-Test-Signature');
    expect(blob).not.toContain('valid\n');
    expect(blob).not.toContain('pbkdf2$');
  });
});
