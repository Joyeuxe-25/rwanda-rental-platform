import { afterEach, describe, expect, it, vi } from 'vitest';

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

/**
 * B3 user-profile tests. Drive the REAL HTTP path (route → requireAuth →
 * validation → controller → service → repository → drizzle-orm/d1 → D1 shim →
 * SQLite). Each test gets a fresh migrated in-memory database.
 */

async function json(res: Response): Promise<any> {
  return res.json();
}

/** Register a user in the given env, returning the session cookie + user. */
async function register(
  env: Bindings,
  overrides: Record<string, unknown> = {},
): Promise<{ token: string; user: any; password: string; payload: any }> {
  const payload = validRegistration(overrides);
  const res = await postJson('/api/v1/auth/register', payload, env);
  return {
    token: getSetCookie(res)!,
    user: (await json(res)).data,
    password: payload.password as string,
    payload,
  };
}

const patch = (path: string, body: unknown, env: Bindings, c?: string) =>
  sendJson('PATCH', path, body, env, c);

// --- GET /api/v1/users/me --------------------------------------------------

describe('GET /api/v1/users/me', () => {
  it('returns 401 without authentication', async () => {
    const { env } = makeTestEnv();
    const res = await get('/api/v1/users/me', env);
    expect(res.status).toBe(401);
  });

  it('returns 200 for an authenticated TENANT with the expected fields', async () => {
    const { env } = makeTestEnv();
    const { token, user } = await register(env, { role: 'TENANT' });
    const res = await get('/api/v1/users/me', env, cookie(token));
    expect(res.status).toBe(200);
    const data = (await json(res)).data;
    expect(data.user.id).toBe(user.id);
    expect(data.user.role).toBe('TENANT');
    expect(data.user).toMatchObject({
      id: expect.any(String),
      role: 'TENANT',
      email: expect.any(String),
      phone: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('returns 200 for an authenticated LANDLORD', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env, { role: 'LANDLORD' });
    const res = await get('/api/v1/users/me', env, cookie(token));
    expect(res.status).toBe(200);
    expect((await json(res)).data.user.role).toBe('LANDLORD');
  });

  it('never exposes password_hash / tokens', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env);
    const res = await get('/api/v1/users/me', env, cookie(token));
    const raw = await res.text();
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain('tokenHash');
    expect(raw).not.toContain('token_hash');
  });
});

// --- PATCH /api/v1/users/me ------------------------------------------------

describe('PATCH /api/v1/users/me', () => {
  it('returns 401 without authentication', async () => {
    const { env } = makeTestEnv();
    const res = await patch('/api/v1/users/me', { firstName: 'X' }, env);
    expect(res.status).toBe(401);
  });

  it('lets a TENANT update allowed fields, persisted and returned as SafeUser', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env, { role: 'TENANT' });

    const res = await patch(
      '/api/v1/users/me',
      { firstName: 'NewFirst', lastName: 'NewLast', phone: '0788777666' },
      env,
      cookie(token),
    );
    expect(res.status).toBe(200);
    const data = (await json(res)).data;
    expect(data.user.firstName).toBe('NewFirst');
    expect(data.user.lastName).toBe('NewLast');
    expect(data.user.phone).toBe('+250788777666'); // normalized
    expect(data.user).not.toHaveProperty('passwordHash');

    // Persisted: a fresh GET reflects the change.
    const after = await get('/api/v1/users/me', env, cookie(token));
    expect((await json(after)).data.user.firstName).toBe('NewFirst');
  });

  it('lets a LANDLORD update allowed fields', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env, { role: 'LANDLORD' });
    const res = await patch('/api/v1/users/me', { firstName: 'Boss' }, env, cookie(token));
    expect(res.status).toBe(200);
    expect((await json(res)).data.user.firstName).toBe('Boss');
  });

  it('rejects a role-change attempt (422) and does not change the role', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env, { role: 'TENANT' });
    const res = await patch('/api/v1/users/me', { role: 'LANDLORD' }, env, cookie(token));
    expect(res.status).toBe(422);

    const me = await get('/api/v1/users/me', env, cookie(token));
    expect((await json(me)).data.user.role).toBe('TENANT');
  });

  it('rejects an attempt to target another user via id/userId (422)', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env);
    const res = await patch(
      '/api/v1/users/me',
      { id: 'someone-else', userId: 'someone-else', firstName: 'X' },
      env,
      cookie(token),
    );
    expect(res.status).toBe(422);
  });

  it('rejects unknown/disallowed fields (422)', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env);
    const res = await patch('/api/v1/users/me', { nickname: 'hacker' }, env, cookie(token));
    expect(res.status).toBe(422);
  });

  it('rejects an empty update object (422)', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env);
    const res = await patch('/api/v1/users/me', {}, env, cookie(token));
    expect(res.status).toBe(422);
  });

  it('rejects an invalid phone (422)', async () => {
    const { env } = makeTestEnv();
    const { token } = await register(env);
    const res = await patch('/api/v1/users/me', { phone: '123' }, env, cookie(token));
    expect(res.status).toBe(422);
  });

  it('rejects a duplicate phone with 409 PHONE_ALREADY_IN_USE', async () => {
    const { env } = makeTestEnv();
    await register(env, { phone: '+250788111000' });
    const b = await register(env, { phone: '+250788222000' });
    const res = await patch('/api/v1/users/me', { phone: '0788111000' }, env, cookie(b.token));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('PHONE_ALREADY_IN_USE');
  });

  it('allows a user to re-set their OWN phone (no false self-conflict)', async () => {
    const { env } = makeTestEnv();
    const { token, user } = await register(env);
    const res = await patch('/api/v1/users/me', { phone: user.phone }, env, cookie(token));
    expect(res.status).toBe(200);
  });
});

// --- Security: isolation between users -------------------------------------

describe('profile ownership / isolation', () => {
  it('User A updating only affects A; B is unchanged (no IDOR)', async () => {
    const { env } = makeTestEnv();
    const a = await register(env, { role: 'TENANT' });
    const b = await register(env, { role: 'LANDLORD' });

    await patch('/api/v1/users/me', { firstName: 'AaaChanged' }, env, cookie(a.token));

    const aMe = (await json(await get('/api/v1/users/me', env, cookie(a.token)))).data.user;
    const bMe = (await json(await get('/api/v1/users/me', env, cookie(b.token)))).data.user;
    expect(aMe.firstName).toBe('AaaChanged');
    expect(bMe.firstName).not.toBe('AaaChanged');
    expect(bMe.id).toBe(b.user.id);
  });

  it('/me always returns the caller (A cannot read B)', async () => {
    const { env } = makeTestEnv();
    const a = await register(env);
    const b = await register(env);
    const aMe = (await json(await get('/api/v1/users/me', env, cookie(a.token)))).data.user;
    expect(aMe.id).toBe(a.user.id);
    expect(aMe.id).not.toBe(b.user.id);
  });
});

// --- Security: no secrets in logs ------------------------------------------

describe('security: profile flow never logs secrets', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not log password hashes or session tokens', async () => {
    const logs: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }

    const { env } = makeTestEnv();
    const { token } = await register(env);
    await get('/api/v1/users/me', env, cookie(token));
    await patch('/api/v1/users/me', { firstName: 'Logged' }, env, cookie(token));

    const blob = logs.join('\n');
    expect(blob).not.toContain('pbkdf2$');
    expect(blob).not.toContain(token);
  });
});
