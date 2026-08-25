import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * B15 OpenAPI documentation tests. The spec is hand-authored from the source
 * code (the authoritative contract). These tests are the CI gate that keeps the
 * documentation valid and prevents it drifting from the implementation.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const spec = JSON.parse(readFileSync(join(ROOT, 'openapi.json'), 'utf8')) as Record<string, any>;

/** Routes that are intentionally public (no session cookie required). */
const PUBLIC_OPS = new Set([
  'getHealth',
  'listPublicProperties',
  'register',
  'login',
  'forgotPassword',
  'resetPassword',
  'getPublicProperty',
  'getPublicPropertyImage',
  'receivePaymentWebhook',
]);

describe('OpenAPI document', () => {
  it('passes the full validator (structure + $ref + route-drift + secrets)', () => {
    // Runs the same validator as `npm run docs:validate`; exits non-zero on any problem.
    const out = execFileSync('node', [join(ROOT, 'scripts', 'validate-openapi.mjs')], {
      encoding: 'utf8',
    });
    expect(out).toContain('matches source exactly');
    expect(out).toContain('No secrets found');
  });

  it('is OpenAPI 3.1.0 with required info/servers', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBeTruthy();
    expect(spec.servers.length).toBeGreaterThan(0);
    expect(spec.servers[0].url).toContain('localhost:4000');
  });

  it('documents exactly the 49 implemented operations', () => {
    const ops: string[] = [];
    for (const item of Object.values<any>(spec.paths)) {
      for (const [m, op] of Object.entries<any>(item)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) ops.push(op.operationId);
      }
    }
    expect(ops.length).toBe(50); // B17 added GET /api/v1/properties (listPublicProperties)
    expect(new Set(ops).size).toBe(50); // unique operationIds
  });

  it('uses a cookie security scheme (no Bearer/JWT) with the real cookie name', () => {
    const s = spec.components.securitySchemes.cookieAuth;
    expect(s).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'rrp_session' });
    expect(spec.security).toEqual([{ cookieAuth: [] }]);
    expect(JSON.stringify(spec)).not.toContain('bearerAuth');
    expect(JSON.stringify(spec)).not.toContain('"scheme":"bearer"');
  });

  it('marks the intended public routes as unauthenticated and everything else as secured', () => {
    for (const item of Object.values<any>(spec.paths)) {
      for (const [m, op] of Object.entries<any>(item)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(m)) continue;
        if (PUBLIC_OPS.has(op.operationId)) {
          expect(op.security, `${op.operationId} should be public`).toEqual([]);
        } else {
          // Inherits the global cookieAuth security (no per-op override).
          expect(op.security, `${op.operationId} should be authenticated`).toBeUndefined();
        }
      }
    }
  });

  it('does NOT expose sensitive fields as schema PROPERTIES (descriptions may mention them)', () => {
    // Collect every property name declared anywhere in the document's schemas.
    const propNames = new Set<string>();
    const collect = (node: any) => {
      if (Array.isArray(node)) return node.forEach(collect);
      if (node && typeof node === 'object') {
        if (node.properties && typeof node.properties === 'object') {
          for (const k of Object.keys(node.properties)) propNames.add(k);
        }
        for (const v of Object.values(node)) collect(v);
      }
    };
    collect(spec);
    // Stored-secret field names must never appear as a schema property. (`password`
    // is a legitimate INPUT field on Register/Login and is intentionally allowed.)
    for (const forbidden of ['passwordHash', 'password_hash', 'tokenHash', 'idempotencyKey']) {
      expect([...propNames], `no schema may expose "${forbidden}"`).not.toContain(forbidden);
    }
    // The SafeUser RESPONSE shape must carry no password field of any kind.
    expect(Object.keys(spec.components.schemas.SafeUser.properties)).not.toContain('password');
  });

  it('keeps Airtel DEFERRED — enum value only, no fictional Airtel endpoint', () => {
    for (const p of Object.keys(spec.paths)) expect(p).not.toMatch(/airtel/i);
    const provider = spec.components.schemas.PaymentProvider;
    expect(provider.enum).toEqual(['MTN_MOMO', 'AIRTEL_MONEY']);
    expect(JSON.stringify(provider)).toContain('DEFERRED');
    // The webhook path documents the 501 not-implemented response.
    expect(spec.paths['/api/v1/payment-webhooks/{provider}'].post.responses['501']).toBeDefined();
  });

  it('documents the MTN webhook as provider-authenticated (not user session, not native signature)', () => {
    const op = spec.paths['/api/v1/payment-webhooks/{provider}'].post;
    expect(op.security).toEqual([]); // no cookie auth
    expect(op.description).toMatch(/NOT.*session/i);
    expect(op.description).toMatch(/not.*cryptographically signed|application-level/i);
  });

  it('documents payment idempotency via the Idempotency-Key header', () => {
    const op = spec.paths['/api/v1/payments'].post;
    const header = op.parameters.find((p: any) => p.name === 'Idempotency-Key');
    expect(header).toBeDefined();
    expect(header.required).toBe(true);
    expect(op.responses['200']).toBeDefined(); // idempotent replay
    expect(op.responses['201']).toBeDefined(); // new intent
  });

  it('documents notification pagination + filters and the public image as binary (not JSON)', () => {
    const list = spec.paths['/api/v1/notifications'].get;
    const names = list.parameters.map((p: any) => p.name);
    expect(names).toEqual(expect.arrayContaining(['page', 'limit', 'unread', 'type']));

    const img = spec.paths['/api/v1/properties/{propertyId}/images/{imageId}'].get;
    const content = img.responses['200'].content;
    expect(Object.keys(content)).toEqual(
      expect.arrayContaining(['image/jpeg', 'image/png', 'image/webp']),
    );
    expect(content['application/json']).toBeUndefined();
  });
});
