import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDb } from '../src/db/client';
import * as paymentService from '../src/services/payment.service';
import type { Bindings } from '../src/types';
import {
  cookie,
  get,
  getSetCookie,
  makeTestEnv,
  postJson,
  sendJson,
  validRegistration,
} from './helpers/app';
import type { TestDb } from './helpers/testDb';

/**
 * B12 notification tests — real HTTP + business-event integration (B6/B7/B8),
 * plus the internal payment-status service for SUCCESSFUL/FAILED transitions.
 */
async function json(res: Response): Promise<any> {
  return res.json();
}
const patch = (p: string, b: unknown, env: Bindings, c?: string) => sendJson('PATCH', p, b, env, c);

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
async function tenant(env: Bindings) {
  seq += 1;
  const res = await postJson(
    '/api/v1/auth/register',
    validRegistration({ role: 'TENANT', email: `tn${seq}@ex.rw` }),
    env,
  );
  return { token: getSetCookie(res)!, user: (await json(res)).data };
}
async function publishedProperty(env: Bindings, token: string): Promise<string> {
  const res = await postJson(
    '/api/v1/properties',
    {
      title: 'Home',
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
async function submitRequest(env: Bindings, tenantToken: string, propertyId: string) {
  return (
    await json(await postJson('/api/v1/rental-requests', { propertyId }, env, cookie(tenantToken)))
  ).data.rentalRequest;
}
async function activeRental(env: Bindings) {
  const ll = await landlord(env);
  const pid = await publishedProperty(env, ll.token);
  const tn = await tenant(env);
  const rr = await submitRequest(env, tn.token, pid);
  await patch(`/api/v1/rental-requests/landlord/${rr.id}/approve`, {}, env, cookie(ll.token));
  const rental = (
    await json(await postJson(`/api/v1/rentals/from-request/${rr.id}`, {}, env, cookie(tn.token)))
  ).data.rental;
  return { ll, tn, pid, requestId: rr.id, rentalId: rental.id as string };
}
let keyN = 0;
async function createPayment(env: Bindings, token: string, rentalId: string) {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: cookie(token),
    'Idempotency-Key': `notif-key-${(keyN += 1)}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const { app } = await import('./helpers/app');
  const res = await app.request(
    '/api/v1/payments',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rentalId,
        amount: 200000,
        paymentPeriod: '2026-08',
        provider: 'MTN_MOMO',
      }),
    },
    env,
  );
  return (await json(res)).data.payment;
}

/** List a user's notifications (optionally with a query string). */
async function notifs(env: Bindings, token: string, query = ''): Promise<any> {
  return json(await get(`/api/v1/notifications${query}`, env, cookie(token)));
}
function types(list: any): string[] {
  return list.data.notifications.map((n: any) => n.type);
}

// --- AUTHORIZATION ----------------------------------------------------------

describe('notification authorization', () => {
  it('401 unauth; tenant & landlord list only their own', async () => {
    const { env } = makeTestEnv();
    expect((await get('/api/v1/notifications', env)).status).toBe(401);
    const { ll, tn } = await activeRental(env);
    expect((await get('/api/v1/notifications', env, cookie(tn.token))).status).toBe(200);
    expect((await get('/api/v1/notifications', env, cookie(ll.token))).status).toBe(200);
    // A tenant never sees the landlord's notifications and vice-versa.
    const tnTypes = types(await notifs(env, tn.token));
    const llTypes = types(await notifs(env, ll.token));
    expect(tnTypes).toContain('RENTAL_ACTIVATED');
    expect(tnTypes).not.toContain('NEW_RENTAL_REQUEST'); // landlord-only
    expect(llTypes).toContain('NEW_RENTAL_REQUEST');
  });

  it('cross-user detail/read → 404 (no existence leak); userId query is ignored', async () => {
    const { env } = makeTestEnv();
    const { tn } = await activeRental(env);
    const other = await tenant(env);
    const n = (await notifs(env, tn.token)).data.notifications[0];
    expect((await get(`/api/v1/notifications/${n.id}`, env, cookie(other.token))).status).toBe(404);
    expect(
      (await patch(`/api/v1/notifications/${n.id}/read`, {}, env, cookie(other.token))).status,
    ).toBe(404);
    // A spoofed ?userId must not change whose notifications are returned.
    const spoof = await notifs(env, other.token, `?userId=${tn.user.id}`);
    expect(spoof.data.notifications).toHaveLength(0);
  });
});

// --- BUSINESS-EVENT INTEGRATION ---------------------------------------------

describe('business-event notifications', () => {
  it('rental-request lifecycle notifies the right recipients', async () => {
    const { env } = makeTestEnv();
    const ll = await landlord(env);
    const pid = await publishedProperty(env, ll.token);
    const tn = await tenant(env);

    const rr = await submitRequest(env, tn.token, pid);
    expect(types(await notifs(env, tn.token))).toContain('RENTAL_REQUEST_SUBMITTED');
    expect(types(await notifs(env, ll.token))).toContain('NEW_RENTAL_REQUEST');

    await patch(`/api/v1/rental-requests/landlord/${rr.id}/approve`, {}, env, cookie(ll.token));
    expect(types(await notifs(env, tn.token))).toContain('RENTAL_REQUEST_ACCEPTED');

    // Reject a fresh one.
    const tn2 = await tenant(env);
    const pid2 = await publishedProperty(env, ll.token);
    const rr2 = await submitRequest(env, tn2.token, pid2);
    await patch(`/api/v1/rental-requests/landlord/${rr2.id}/reject`, {}, env, cookie(ll.token));
    expect(types(await notifs(env, tn2.token))).toContain('RENTAL_REQUEST_REJECTED');

    // Cancel a fresh one → landlord notified.
    const tn3 = await tenant(env);
    const pid3 = await publishedProperty(env, ll.token);
    const rr3 = await submitRequest(env, tn3.token, pid3);
    await patch(`/api/v1/rental-requests/mine/${rr3.id}/cancel`, {}, env, cookie(tn3.token));
    expect(types(await notifs(env, ll.token))).toContain('RENTAL_REQUEST_CANCELLED');
  });

  it('rental activation, completion and payment events notify both parties', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, rentalId } = await activeRental(env);
    expect(types(await notifs(env, tn.token))).toContain('RENTAL_ACTIVATED');
    expect(types(await notifs(env, ll.token))).toContain('RENTAL_ACTIVATED');

    // Payment intent (no MTN config → plain PENDING) → tenant PAYMENT_INITIATED.
    const payment = await createPayment(env, tn.token, rentalId);
    expect(types(await notifs(env, tn.token))).toContain('PAYMENT_INITIATED');

    // Internal transition PENDING → SUCCESSFUL → tenant + landlord notified.
    await paymentService.applyProviderStatus(getDb(env), payment.id, 'SUCCESSFUL');
    expect(types(await notifs(env, tn.token))).toContain('PAYMENT_SUCCESSFUL');
    expect(types(await notifs(env, ll.token))).toContain('PAYMENT_RECEIVED');

    // Complete the rental → both notified.
    await patch(`/api/v1/rentals/landlord/${rentalId}/complete`, {}, env, cookie(ll.token));
    expect(types(await notifs(env, tn.token))).toContain('RENTAL_COMPLETED');
    expect(types(await notifs(env, ll.token))).toContain('RENTAL_COMPLETED');
  });

  it('payment FAILED notifies both parties', async () => {
    const { env } = makeTestEnv();
    const { ll, tn, rentalId } = await activeRental(env);
    const payment = await createPayment(env, tn.token, rentalId);
    await paymentService.applyProviderStatus(getDb(env), payment.id, 'FAILED');
    expect(types(await notifs(env, tn.token))).toContain('PAYMENT_FAILED');
    expect(types(await notifs(env, ll.token))).toContain('PAYMENT_FAILED');
  });
});

// --- DEDUPLICATION ----------------------------------------------------------

describe('deduplication', () => {
  it('idempotent transitions/actions do not duplicate notifications', async () => {
    const { env, db } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const payment = await createPayment(env, tn.token, rentalId);

    await paymentService.applyProviderStatus(getDb(env), payment.id, 'SUCCESSFUL');
    await paymentService.applyProviderStatus(getDb(env), payment.id, 'SUCCESSFUL'); // idempotent no-op

    const successCount = db
      .prepare(
        "SELECT COUNT(*) AS c FROM notifications WHERE type = 'PAYMENT_SUCCESSFUL' AND user_id = ?",
      )
      .get(tn.user.id) as { c: number };
    expect(successCount.c).toBe(1);

    // Duplicate PAYMENT_INITIATED (same payment) is impossible via the unique key.
    const initCount = db
      .prepare(
        "SELECT COUNT(*) AS c FROM notifications WHERE type = 'PAYMENT_INITIATED' AND user_id = ?",
      )
      .get(tn.user.id) as { c: number };
    expect(initCount.c).toBe(1);
  });

  it('different business events for the same user create distinct notifications', async () => {
    const { env, db } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const p1 = await createPayment(env, tn.token, rentalId);
    const p2 = await createPayment(env, tn.token, rentalId);
    expect(p1.id).not.toBe(p2.id);
    const c = db
      .prepare(
        "SELECT COUNT(*) AS c FROM notifications WHERE type = 'PAYMENT_INITIATED' AND user_id = ?",
      )
      .get(tn.user.id) as { c: number };
    expect(c.c).toBe(2); // two distinct payments → two notifications
  });
});

// --- FAILURE ISOLATION ------------------------------------------------------

describe('failure isolation', () => {
  it('a duplicate/blocked notification never corrupts the payment transition', async () => {
    const { env, db } = makeTestEnv();
    const { tn, rentalId } = await activeRental(env);
    const payment = await createPayment(env, tn.token, rentalId);
    // Pre-seed the tenant's success notification so the event-key conflicts.
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, event_key, is_read)
       VALUES (?, ?, 'PAYMENT_SUCCESSFUL', 't', 'm', ?, 0)`,
    ).run(`pre_${payment.id}`, tn.user.id, `pay_success:${payment.id}`);

    // Transition still succeeds (payment is authoritative) despite the conflict.
    const updated = await paymentService.applyProviderStatus(getDb(env), payment.id, 'SUCCESSFUL');
    expect(updated.status).toBe('SUCCESSFUL');
    const status = db.prepare('SELECT status FROM payments WHERE id = ?').get(payment.id) as {
      status: string;
    };
    expect(status.status).toBe('SUCCESSFUL');
    // No duplicate tenant success notification (deduped by event key).
    const c = db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND event_key = ?')
      .get(tn.user.id, `pay_success:${payment.id}`) as { c: number };
    expect(c.c).toBe(1);
  });
});

// --- LISTING / FILTERING / PAGINATION ---------------------------------------

function seedNotifications(db: TestDb, userId: string, n: number) {
  for (let i = 0; i < n; i++) {
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
       VALUES (?, ?, 'RENT_REMINDER', ?, 'm', ?, ?)`,
    ).run(`seed_${userId}_${i}`, userId, `n${i}`, i % 2, 1000 + i);
  }
}

describe('listing, filtering, pagination', () => {
  it('newest first + pagination + limit + unreadCount', async () => {
    const { env, db } = makeTestEnv();
    const u = await tenant(env);
    seedNotifications(db, u.user.id, 25); // created_at 1000..1024, half unread

    const page1 = await notifs(env, u.token, '?page=1&limit=10');
    expect(page1.data.notifications).toHaveLength(10);
    expect(page1.data.pagination).toMatchObject({ page: 1, limit: 10, total: 25, totalPages: 3 });
    // Newest first: created_at strictly decreasing.
    const created = page1.data.notifications.map((n: any) => Date.parse(n.createdAt));
    for (let i = 1; i < created.length; i++)
      expect(created[i - 1]).toBeGreaterThanOrEqual(created[i]);
    // unreadCount reflects the seeded unread rows (i%2===0 → 13 unread of 25).
    expect(page1.data.unreadCount).toBe(13);

    const page3 = await notifs(env, u.token, '?page=3&limit=10');
    expect(page3.data.notifications).toHaveLength(5);
  });

  it('unread filter, type filter, and validation', async () => {
    const { env, db } = makeTestEnv();
    const u = await tenant(env);
    seedNotifications(db, u.user.id, 6); // 3 unread, 3 read; all RENT_REMINDER

    expect(
      (await notifs(env, u.token, '?unread=true')).data.notifications.every((n: any) => !n.isRead),
    ).toBe(true);
    expect(
      (await notifs(env, u.token, '?unread=false')).data.notifications.every((n: any) => n.isRead),
    ).toBe(true);
    expect((await notifs(env, u.token, '?type=RENT_REMINDER')).data.notifications).toHaveLength(6);
    // Invalid type / pagination → 422.
    expect((await get('/api/v1/notifications?type=BOGUS', env, cookie(u.token))).status).toBe(422);
    expect((await get('/api/v1/notifications?page=0', env, cookie(u.token))).status).toBe(422);
    expect((await get('/api/v1/notifications?limit=9999', env, cookie(u.token))).status).toBe(422);
  });
});

// --- READ STATE -------------------------------------------------------------

describe('read state', () => {
  it('mark one read (idempotent) sets readAt; mark-all read is idempotent', async () => {
    const { env, db } = makeTestEnv();
    const u = await tenant(env);
    seedNotifications(db, u.user.id, 4);
    const list = await notifs(env, u.token);
    const unread = list.data.notifications.find((n: any) => !n.isRead);

    const r1 = await patch(`/api/v1/notifications/${unread.id}/read`, {}, env, cookie(u.token));
    expect(r1.status).toBe(200);
    const marked = (await json(r1)).data.notification;
    expect(marked.isRead).toBe(true);
    expect(marked.readAt).not.toBeNull();
    // Idempotent: marking again keeps the same readAt.
    const r2 = await patch(`/api/v1/notifications/${unread.id}/read`, {}, env, cookie(u.token));
    expect((await json(r2)).data.notification.readAt).toBe(marked.readAt);

    // Mark all read.
    const all = await patch('/api/v1/notifications/read-all', {}, env, cookie(u.token));
    expect(all.status).toBe(200);
    expect((await notifs(env, u.token, '?unread=true')).data.notifications).toHaveLength(0);
    // Idempotent: 0 updated the second time.
    const again = await patch('/api/v1/notifications/read-all', {}, env, cookie(u.token));
    expect((await json(again)).data.updated).toBe(0);
  });
});

// --- SECURITY ---------------------------------------------------------------

describe('security', () => {
  afterEach(() => vi.restoreAllMocks());
  it('responses omit internal fields; no secrets in logs', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) =>
        logs.push(a.map(String).join(' ')),
      );
    }
    const { env } = makeTestEnv();
    const { tn } = await activeRental(env);
    const raw = await (await get('/api/v1/notifications', env, cookie(tn.token))).text();
    for (const bad of [
      'passwordHash',
      'password_hash',
      'eventKey',
      'event_key',
      'userId',
      'user_id',
      'tokenHash',
    ]) {
      expect(raw, bad).not.toContain(bad);
    }
    expect(logs.join('\n')).not.toContain('pbkdf2$');
    expect(logs.join('\n')).not.toContain(tn.token);
  });
});
