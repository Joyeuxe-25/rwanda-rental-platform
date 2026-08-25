import { createApp } from '../../src/app';
import type { Bindings } from '../../src/types';
import { D1Shim } from './d1shim';
import { R2TestBucket } from './r2shim';
import { createTestDb, type TestDb } from './testDb';

/**
 * Build a fresh test environment: an in-memory SQLite database with the real
 * migrations applied (wrapped in a D1 shim) and an in-memory R2 shim, exposed as
 * the Worker `env`. Returns the raw `db` and `r2` too, so tests can inspect or
 * tamper with rows/objects directly.
 */
export function makeTestEnv(): { env: Bindings; db: TestDb; r2: R2TestBucket } {
  const db = createTestDb();
  const r2 = new R2TestBucket();
  const env: Bindings = {
    DB: new D1Shim(db) as unknown as D1Database,
    ASSETS: r2 as unknown as R2Bucket,
    ENVIRONMENT: 'test',
    FRONTEND_URL: 'http://localhost:3000',
  };
  return { env, db, r2 };
}

/** Build fake image bytes with valid magic bytes for the given type. */
export function fakeImageBytes(type: 'jpeg' | 'png' | 'webp', totalBytes = 128): Uint8Array {
  const header =
    type === 'jpeg'
      ? [0xff, 0xd8, 0xff, 0xe0]
      : type === 'png'
        ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        : [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]; // RIFF....WEBP
  const buf = new Uint8Array(Math.max(totalBytes, header.length));
  buf.set(header, 0);
  return buf;
}

/** Upload an image via multipart to a landlord's property. */
export async function uploadImage(
  env: Bindings,
  propertyId: string,
  token: string,
  opts: {
    type?: 'jpeg' | 'png' | 'webp';
    filename?: string;
    bytes?: Uint8Array;
    noFile?: boolean;
  } = {},
): Promise<Response> {
  const type = opts.type ?? 'jpeg';
  const form = new FormData();
  if (!opts.noFile) {
    const bytes = opts.bytes ?? fakeImageBytes(type);
    form.append(
      'file',
      new Blob([bytes], { type: `image/${type}` }),
      opts.filename ?? `photo.${type}`,
    );
  }
  return app.request(
    `/api/v1/properties/mine/${propertyId}/images`,
    { method: 'POST', headers: { Cookie: cookie(token) }, body: form },
    env,
  );
}

/** A reusable Hono app instance (stateless; DB comes from the per-request env). */
export const app = createApp();

/** Read the session cookie value from a response's Set-Cookie header(s). */
export function getSetCookie(res: Response, name = 'rrp_session'): string | null {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const all = headers.getSetCookie ? headers.getSetCookie() : [];
  const list = all.length ? all : [res.headers.get('set-cookie') ?? ''];
  for (const line of list) {
    const match = new RegExp(`${name}=([^;]*)`).exec(line);
    if (match) return match[1] ?? null;
  }
  return null;
}

/** Build a Cookie request header for the given session token. */
export function cookie(token: string, name = 'rrp_session'): string {
  return `${name}=${token}`;
}

/** Helper to POST JSON to the app with a given env (and optional cookie). */
export async function postJson(
  path: string,
  body: unknown,
  env: Bindings,
  cookieHeader?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, env);
}

/** Helper to GET from the app with a given env (and optional cookie). */
export async function get(path: string, env: Bindings, cookieHeader?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  return app.request(path, { method: 'GET', headers }, env);
}

/** Helper to send a JSON body with an arbitrary method (e.g. PATCH). */
export async function sendJson(
  method: string,
  path: string,
  body: unknown,
  env: Bindings,
  cookieHeader?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  return app.request(path, { method, headers, body: JSON.stringify(body) }, env);
}

/** Convenience: a valid registration payload with overridable fields. */
let seq = 0;
export function validRegistration(overrides: Partial<Record<string, unknown>> = {}) {
  seq += 1;
  return {
    firstName: 'Jean',
    lastName: 'Uwimana',
    email: `user${seq}@example.rw`,
    phone: `+2507${80000000 + seq}`,
    password: 'correct horse battery',
    role: 'TENANT',
    ...overrides,
  };
}
