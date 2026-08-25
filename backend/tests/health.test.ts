import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { Bindings } from '../src/types';

const app = createApp();

// Minimal fake env for DB-independent routes. D1/R2 bindings are not exercised
// by the health/404 endpoints, so they are stubbed as unknown.
const env = {
  ENVIRONMENT: 'test',
  FRONTEND_URL: 'http://localhost:3000',
  DB: undefined as unknown,
  ASSETS: undefined as unknown,
} as unknown as Bindings;

describe('GET /api/v1/health', () => {
  it('returns 200 with a success envelope confirming the API is running', async () => {
    const res = await app.request('/api/v1/health', {}, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      message: 'Rwanda Rental Platform API is running',
      status: 'ok',
    });
    expect(typeof body.data.timestamp).toBe('string');
  });
});

describe('unknown routes', () => {
  it('returns a consistent 404 error envelope', async () => {
    const res = await app.request('/api/v1/does-not-exist', {}, env);
    expect(res.status).toBe(404);

    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND' });
  });
});
