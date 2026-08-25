import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { onError } from '../src/lib/errorHandler';
import { requireAuth } from '../src/middleware/auth';
import { requireRole } from '../src/middleware/role';
import type { AppEnv, Bindings } from '../src/types';
import { cookie, get, getSetCookie, makeTestEnv, postJson, validRegistration } from './helpers/app';

/**
 * B2 authentication & authorization tests.
 *
 * These drive the REAL HTTP path (Hono route → validation → controller →
 * service → repository → drizzle-orm/d1 → D1 shim → SQLite). Each test gets a
 * fresh migrated in-memory database.
 */

async function json(res: Response): Promise<any> {
  return res.json();
}

/** Register a user and return { env, db, cookie, user, password }. */
async function registerUser(overrides: Record<string, unknown> = {}) {
  const { env, db } = makeTestEnv();
  const payload = validRegistration(overrides);
  const res = await postJson('/api/v1/auth/register', payload, env);
  const token = getSetCookie(res);
  const body = await json(res);
  return {
    env,
    db,
    res,
    token: token!,
    user: body.data,
    password: payload.password as string,
    payload,
  };
}

// --- Registration ----------------------------------------------------------

describe('POST /api/v1/auth/register', () => {
  it('registers a valid TENANT and returns a safe user (no password_hash)', async () => {
    const { res, user } = await registerUser({ role: 'TENANT' });
    expect(res.status).toBe(201);
    expect(user.role).toBe('TENANT');
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password_hash');
    expect(user).not.toHaveProperty('password');
  });

  it('registers a valid LANDLORD', async () => {
    const { res, user } = await registerUser({ role: 'LANDLORD' });
    expect(res.status).toBe(201);
    expect(user.role).toBe('LANDLORD');
  });

  it('creates a session cookie on registration (auto-login)', async () => {
    const { res, token } = await registerUser();
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(token).toBeTruthy();
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  it('rejects an invalid role (422)', async () => {
    const { env } = makeTestEnv();
    const res = await postJson('/api/v1/auth/register', validRegistration({ role: 'ADMIN' }), env);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a too-short password (422)', async () => {
    const { env } = makeTestEnv();
    const res = await postJson(
      '/api/v1/auth/register',
      validRegistration({ password: 'short' }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it('rejects duplicate email (409, AUTH_EMAIL_EXISTS)', async () => {
    const { env } = makeTestEnv();
    await postJson('/api/v1/auth/register', validRegistration({ email: 'dup@example.rw' }), env);
    const res = await postJson(
      '/api/v1/auth/register',
      validRegistration({ email: 'dup@example.rw' }),
      env,
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('AUTH_EMAIL_EXISTS');
  });

  it('rejects duplicate phone (409, AUTH_PHONE_EXISTS)', async () => {
    const { env } = makeTestEnv();
    await postJson('/api/v1/auth/register', validRegistration({ phone: '+250788111222' }), env);
    const res = await postJson(
      '/api/v1/auth/register',
      validRegistration({ phone: '0788111222' }), // same number, un-normalized
      env,
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('AUTH_PHONE_EXISTS');
  });

  it('stores the password hashed, never in plaintext', async () => {
    const { db, user, password } = await registerUser();
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as {
      password_hash: string;
    };
    expect(row.password_hash).not.toBe(password);
    expect(row.password_hash.startsWith('pbkdf2$')).toBe(true);
  });
});

// --- Login -----------------------------------------------------------------

describe('POST /api/v1/auth/login', () => {
  it('logs in with correct credentials and sets a session cookie', async () => {
    const { env, payload } = await registerUser();
    const res = await postJson(
      '/api/v1/auth/login',
      { email: payload.email, password: payload.password },
      env,
    );
    expect(res.status).toBe(200);
    expect(getSetCookie(res)).toBeTruthy();
    const body = await json(res);
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects an incorrect password with a generic 401', async () => {
    const { env, payload } = await registerUser();
    const res = await postJson(
      '/api/v1/auth/login',
      { email: payload.email, password: 'wrong-password' },
      env,
    );
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(body.error.message).toBe('Invalid email or password');
  });

  it('rejects a nonexistent account with the same generic 401', async () => {
    const { env } = makeTestEnv();
    const res = await postJson(
      '/api/v1/auth/login',
      { email: 'nobody@example.rw', password: 'whatever123' },
      env,
    );
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });
});

// --- Authentication (/me) --------------------------------------------------

describe('GET /api/v1/auth/me', () => {
  it('returns 401 without a session', async () => {
    const { env } = makeTestEnv();
    const res = await get('/api/v1/auth/me', env);
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('returns the current user with a valid session', async () => {
    const { env, token, user } = await registerUser();
    const res = await get('/api/v1/auth/me', env, cookie(token));
    expect(res.status).toBe(200);
    expect((await json(res)).data.id).toBe(user.id);
  });

  it('returns 401 for an invalid session token', async () => {
    const { env } = await registerUser();
    const res = await get('/api/v1/auth/me', env, cookie('not-a-real-token'));
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe('AUTH_SESSION_INVALID');
  });

  it('returns 401 for an expired session', async () => {
    const { env, db, token } = await registerUser();
    db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1000);
    const res = await get('/api/v1/auth/me', env, cookie(token));
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe('AUTH_SESSION_EXPIRED');
  });

  it('returns 401 for a revoked session', async () => {
    const { env, db, token } = await registerUser();
    db.prepare('UPDATE sessions SET revoked_at = ?').run(Date.now());
    const res = await get('/api/v1/auth/me', env, cookie(token));
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe('AUTH_SESSION_INVALID');
  });
});

// --- Logout ----------------------------------------------------------------

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session server-side and clears the cookie', async () => {
    const { env, token } = await registerUser();

    const logoutRes = await postJson('/api/v1/auth/logout', {}, env, cookie(token));
    expect(logoutRes.status).toBe(200);
    const cleared = logoutRes.headers.get('set-cookie') ?? '';
    expect(cleared).toContain('rrp_session=');
    expect(cleared.toLowerCase()).toMatch(/max-age=0|expires=/);

    // The previously valid session no longer authenticates.
    const meRes = await get('/api/v1/auth/me', env, cookie(token));
    expect(meRes.status).toBe(401);
  });
});

// --- Role authorization ----------------------------------------------------

describe('role authorization middleware', () => {
  // A tiny app that exercises the real requireAuth + requireRole middleware.
  const roleApp = new Hono<AppEnv>();
  roleApp.get('/landlord-only', requireAuth, requireRole('LANDLORD'), (c) => c.json({ ok: true }));
  roleApp.get('/tenant-only', requireAuth, requireRole('TENANT'), (c) => c.json({ ok: true }));
  roleApp.onError(onError); // map ApiError → proper status, like the real app

  async function sessionFor(
    role: 'LANDLORD' | 'TENANT',
  ): Promise<{ env: Bindings; token: string }> {
    const { env } = makeTestEnv();
    const res = await postJson('/api/v1/auth/register', validRegistration({ role }), env);
    return { env, token: getSetCookie(res)! };
  }

  it('LANDLORD passes requireRole(LANDLORD)', async () => {
    const { env, token } = await sessionFor('LANDLORD');
    const res = await roleApp.request(
      '/landlord-only',
      { headers: { Cookie: cookie(token) } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it('TENANT cannot pass requireRole(LANDLORD) → 403', async () => {
    const { env, token } = await sessionFor('TENANT');
    const res = await roleApp.request(
      '/landlord-only',
      { headers: { Cookie: cookie(token) } },
      env,
    );
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe('AUTH_FORBIDDEN');
  });

  it('TENANT passes requireRole(TENANT)', async () => {
    const { env, token } = await sessionFor('TENANT');
    const res = await roleApp.request('/tenant-only', { headers: { Cookie: cookie(token) } }, env);
    expect(res.status).toBe(200);
  });

  it('LANDLORD cannot pass requireRole(TENANT) → 403', async () => {
    const { env, token } = await sessionFor('LANDLORD');
    const res = await roleApp.request('/tenant-only', { headers: { Cookie: cookie(token) } }, env);
    expect(res.status).toBe(403);
  });
});

// --- Password change -------------------------------------------------------

describe('POST /api/v1/auth/change-password', () => {
  it('changes the password with the correct current password', async () => {
    const { env, token, payload } = await registerUser();
    const res = await postJson(
      '/api/v1/auth/change-password',
      { currentPassword: payload.password, newPassword: 'a-brand-new-password' },
      env,
      cookie(token),
    );
    expect(res.status).toBe(200);

    // Old password no longer works; new one does.
    const oldLogin = await postJson(
      '/api/v1/auth/login',
      { email: payload.email, password: payload.password },
      env,
    );
    expect(oldLogin.status).toBe(401);
    const newLogin = await postJson(
      '/api/v1/auth/login',
      { email: payload.email, password: 'a-brand-new-password' },
      env,
    );
    expect(newLogin.status).toBe(200);
  });

  it('rejects an incorrect current password (401)', async () => {
    const { env, token } = await registerUser();
    const res = await postJson(
      '/api/v1/auth/change-password',
      { currentPassword: 'not-the-password', newPassword: 'a-brand-new-password' },
      env,
      cookie(token),
    );
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe('AUTH_PASSWORD_INVALID');
  });

  it('invalidates existing sessions after a change (issuing a fresh one)', async () => {
    const { env, token, payload } = await registerUser();
    // Log in a SECOND session (separate device).
    const second = await postJson(
      '/api/v1/auth/login',
      { email: payload.email, password: payload.password },
      env,
    );
    const secondToken = getSetCookie(second)!;

    await postJson(
      '/api/v1/auth/change-password',
      { currentPassword: payload.password, newPassword: 'a-brand-new-password' },
      env,
      cookie(token),
    );

    // Both prior sessions are now revoked.
    expect((await get('/api/v1/auth/me', env, cookie(token))).status).toBe(401);
    expect((await get('/api/v1/auth/me', env, cookie(secondToken))).status).toBe(401);
  });
});

// --- Password reset --------------------------------------------------------

describe('password reset flow', () => {
  it('forgot-password does not reveal whether the account exists', async () => {
    const { env, payload } = await registerUser();
    const known = await postJson('/api/v1/auth/forgot-password', { email: payload.email }, env);
    const unknown = await postJson(
      '/api/v1/auth/forgot-password',
      { email: 'nobody@example.rw' },
      env,
    );
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    const knownBody = await json(known);
    const unknownBody = await json(unknown);
    expect(knownBody.data.message).toBe(unknownBody.data.message);
    // The dev token appears only for the existing account (test env only).
    expect(knownBody.data.devResetToken).toBeTruthy();
    expect(unknownBody.data.devResetToken).toBeUndefined();
  });

  it('resets the password with a valid token and invalidates sessions', async () => {
    const { env, token, payload } = await registerUser();
    const forgot = await postJson('/api/v1/auth/forgot-password', { email: payload.email }, env);
    const resetToken = (await json(forgot)).data.devResetToken as string;

    const reset = await postJson(
      '/api/v1/auth/reset-password',
      { token: resetToken, newPassword: 'reset-password-123' },
      env,
    );
    expect(reset.status).toBe(200);

    // Old session revoked; new password works.
    expect((await get('/api/v1/auth/me', env, cookie(token))).status).toBe(401);
    const login = await postJson(
      '/api/v1/auth/login',
      { email: payload.email, password: 'reset-password-123' },
      env,
    );
    expect(login.status).toBe(200);
  });

  it('rejects a reused (single-use) reset token', async () => {
    const { env, payload } = await registerUser();
    const forgot = await postJson('/api/v1/auth/forgot-password', { email: payload.email }, env);
    const resetToken = (await json(forgot)).data.devResetToken as string;

    await postJson(
      '/api/v1/auth/reset-password',
      { token: resetToken, newPassword: 'first-reset-1' },
      env,
    );
    const second = await postJson(
      '/api/v1/auth/reset-password',
      { token: resetToken, newPassword: 'second-reset-2' },
      env,
    );
    expect(second.status).toBe(400);
    expect((await json(second)).error.code).toBe('AUTH_PASSWORD_RESET_INVALID');
  });

  it('rejects an expired reset token', async () => {
    const { env, db, payload } = await registerUser();
    const forgot = await postJson('/api/v1/auth/forgot-password', { email: payload.email }, env);
    const resetToken = (await json(forgot)).data.devResetToken as string;
    db.prepare('UPDATE password_reset_tokens SET expires_at = ?').run(Date.now() - 1000);

    const res = await postJson(
      '/api/v1/auth/reset-password',
      { token: resetToken, newPassword: 'too-late-123' },
      env,
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('AUTH_PASSWORD_RESET_EXPIRED');
  });

  it('rejects an invalid reset token', async () => {
    const { env } = makeTestEnv();
    const res = await postJson(
      '/api/v1/auth/reset-password',
      { token: 'totally-made-up', newPassword: 'whatever-123' },
      env,
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('AUTH_PASSWORD_RESET_INVALID');
  });
});

// --- Security: no secrets in logs ------------------------------------------

describe('security: secrets are never logged', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not log passwords, session tokens, or reset tokens', async () => {
    const logs: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }

    const { env } = makeTestEnv();
    const password = 'super-secret-passphrase';
    const reg = await postJson(
      '/api/v1/auth/register',
      validRegistration({ email: 'sec@example.rw', password }),
      env,
    );
    const token = getSetCookie(reg)!;
    await get('/api/v1/auth/me', env, cookie(token));
    const forgot = await postJson('/api/v1/auth/forgot-password', { email: 'sec@example.rw' }, env);
    const resetToken = ((await forgot.json()) as any).data.devResetToken as string;

    const blob = logs.join('\n');
    expect(blob).not.toContain(password);
    expect(blob).not.toContain(token);
    expect(blob).not.toContain(resetToken);
  });
});
