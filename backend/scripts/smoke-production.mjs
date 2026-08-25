#!/usr/bin/env node
/**
 * B16 production smoke test — READ-ONLY and non-mutating.
 *
 * Verifies a deployed API is reachable and behaving, using only safe GET
 * requests. It NEVER creates users/rentals/payments, never calls MTN, and never
 * mutates data.
 *
 *   API_BASE_URL=https://api.example.com npm run smoke:production
 *   API_BASE_URL=https://api.example.com PUBLIC_PROPERTY_ID=<uuid> npm run smoke:production
 *
 * Checks:
 *   1. GET /api/v1/health                      → 200, { success: true }
 *   2. GET /api/v1/users/me (no cookie)        → 401 (auth is enforced)
 *   3. GET /api/v1/properties/{id} (optional)  → 200 (only if PUBLIC_PROPERTY_ID given)
 */
const base = process.env.API_BASE_URL;
if (!base) {
  console.error(
    'FAIL: set API_BASE_URL, e.g. API_BASE_URL=https://api.example.com npm run smoke:production',
  );
  process.exit(1);
}
if (!/^https?:\/\//.test(base)) {
  console.error('FAIL: API_BASE_URL must start with http(s)://');
  process.exit(1);
}
const root = base.replace(/\/+$/, '');
const results = [];
const fail = (m) => results.push(['FAIL', m]);
const ok = (m) => results.push(['ok', m]);

async function main() {
  // 1) Health
  try {
    const res = await fetch(`${root}/api/v1/health`);
    const body = await res.json().catch(() => ({}));
    if (res.status === 200 && body?.success === true)
      ok(`health 200 (${body?.data?.environment ?? '?'})`);
    else fail(`health expected 200/success, got ${res.status}`);
  } catch (e) {
    fail(`health request error: ${e.message}`);
  }

  // 2) Protected route must reject an unauthenticated request
  try {
    const res = await fetch(`${root}/api/v1/users/me`);
    if (res.status === 401) ok('unauthenticated /users/me → 401 (auth enforced)');
    else fail(`unauthenticated /users/me expected 401, got ${res.status}`);
  } catch (e) {
    fail(`/users/me request error: ${e.message}`);
  }

  // 3) Optional public property (read-only)
  const pid = process.env.PUBLIC_PROPERTY_ID;
  if (pid) {
    try {
      const res = await fetch(`${root}/api/v1/properties/${encodeURIComponent(pid)}`);
      if (res.status === 200) ok(`public property ${pid} → 200`);
      else fail(`public property ${pid} expected 200, got ${res.status}`);
    } catch (e) {
      fail(`public property request error: ${e.message}`);
    }
  } else {
    ok('public property check skipped (set PUBLIC_PROPERTY_ID to enable)');
  }

  for (const [tag, msg] of results) console.log(`  [${tag}] ${msg}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  if (failed) {
    console.error(`\nSmoke test FAILED (${failed} check(s)).`);
    process.exit(1);
  }
  console.log(`\nSmoke test PASSED (read-only) against ${root}.`);
}
main();
