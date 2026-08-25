#!/usr/bin/env node
/**
 * Frontend production smoke test (F10) — READ-ONLY, dependency-free.
 *
 * Verifies a deployed frontend serves its public pages. It NEVER authenticates,
 * creates users/rentals/payments, mutates notifications, or calls MTN/Airtel.
 *
 * Usage:  FRONTEND_URL=https://www.YOUR_DOMAIN.com node scripts/smoke-production.mjs
 *
 * It checks the FRONTEND only. Backend/API health is a separate concern —
 * see backend/docs/DEPLOYMENT.md (`smoke:production`).
 */

const base = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
if (!base) {
  console.error('✗ Set FRONTEND_URL, e.g. FRONTEND_URL=https://www.YOUR_DOMAIN.com');
  process.exit(1);
}
if (!/^https?:\/\//.test(base)) {
  console.error('✗ FRONTEND_URL must be an absolute http(s) URL.');
  process.exit(1);
}

/** GET a path and return { status, ok, body } without following into private data. */
async function get(path) {
  const url = base + path;
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'text/html' },
  });
  const body = await res.text().catch(() => '');
  return { url, status: res.status, ok: res.status >= 200 && res.status < 400, body };
}

const checks = [
  { path: '/', expect: 200, marker: /Rwanda Rental/i },
  { path: '/properties', expect: 200, marker: /propert/i },
];

let failed = 0;
for (const c of checks) {
  try {
    const r = await get(c.path);
    const okStatus = r.status === c.expect;
    const okMarker = !c.marker || c.marker.test(r.body);
    if (okStatus && okMarker) {
      console.log(`✓ ${c.path} → ${r.status}`);
    } else {
      failed++;
      console.error(`✗ ${c.path} → ${r.status}${okMarker ? '' : ' (content marker missing)'}`);
    }
  } catch (err) {
    failed++;
    console.error(`✗ ${c.path} → request failed: ${err instanceof Error ? err.message : 'error'}`);
  }
}

// A private route must NOT serve authenticated content to an anonymous request.
// (It should render the auth-loading/redirect shell, never account data.)
try {
  const r = await get('/account');
  if (/your account|edit profile|member since/i.test(r.body)) {
    failed++;
    console.error('✗ /account leaked authenticated content to an anonymous request!');
  } else {
    console.log('✓ /account does not expose private content anonymously');
  }
} catch {
  console.log('· /account check skipped (request failed)');
}

if (failed > 0) {
  console.error(`\n✗ Frontend smoke FAILED (${failed} check(s)).`);
  process.exit(1);
}
console.log('\n✓ Frontend smoke passed (public pages served; no anonymous private leak).');
process.exit(0);
