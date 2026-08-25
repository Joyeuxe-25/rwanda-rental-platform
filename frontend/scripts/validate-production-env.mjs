#!/usr/bin/env node
/**
 * Production environment validator (F10) — dependency-free, secret-free.
 *
 * Validates the ONE public variable the frontend needs in production:
 *   NEXT_PUBLIC_API_URL   e.g. https://api.YOUR_DOMAIN.com/api/v1
 *
 * It also fails the build if any `NEXT_PUBLIC_*` variable looks secret-like,
 * because everything with that prefix is embedded in the browser bundle.
 *
 * EXITS NON-ZERO while the value is missing / localhost / http / a placeholder —
 * this is intentional so a production build cannot silently ship a bad API base.
 * Run with a real value:  NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 \
 *   node scripts/validate-production-env.mjs
 *
 * It NEVER prints a variable's value — only names and pass/fail reasons.
 */

const errors = [];
const notes = [];

const raw = process.env.NEXT_PUBLIC_API_URL;

if (!raw || raw.trim() === '') {
  errors.push('NEXT_PUBLIC_API_URL is not set. Set it to https://api.YOUR_DOMAIN.com/api/v1.');
} else {
  const value = raw.trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push('NEXT_PUBLIC_API_URL is not a valid URL.');
  }

  if (url) {
    if (url.protocol !== 'https:') {
      errors.push('NEXT_PUBLIC_API_URL must use https:// in production.');
    }
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(url.hostname)) {
      errors.push('NEXT_PUBLIC_API_URL points at localhost — not a production API.');
    }
    if (/your[_-]?domain|example\.com|placeholder|changeme|todo/i.test(value)) {
      errors.push('NEXT_PUBLIC_API_URL still contains a placeholder domain.');
    }
    if (!/\/api\/v1\/?$/.test(url.pathname)) {
      errors.push('NEXT_PUBLIC_API_URL should end with the /api/v1 version prefix.');
    }
    if (url.search || url.hash) {
      errors.push('NEXT_PUBLIC_API_URL must not contain a query string or fragment.');
    }
  }
}

// Guard: no NEXT_PUBLIC_* variable may look like a secret (browser-visible!).
const SECRETY =
  /(SECRET|API_KEY|APIKEY|PRIVATE|PASSWORD|TOKEN|SUBSCRIPTION_KEY|CALLBACK_TOKEN|CREDENTIAL)/i;
const ALLOW = new Set(['NEXT_PUBLIC_API_URL']);
for (const name of Object.keys(process.env)) {
  if (name.startsWith('NEXT_PUBLIC_') && !ALLOW.has(name) && SECRETY.test(name)) {
    errors.push(
      `Suspicious public variable "${name}" — NEXT_PUBLIC_* is browser-visible; do not put secrets here.`,
    );
  }
}

notes.push(
  'Only NEXT_PUBLIC_* values reach the browser; backend/provider secrets stay on the Cloudflare Worker.',
);

if (errors.length > 0) {
  console.error('✗ Production frontend env is NOT ready:\n');
  for (const e of errors) console.error('  - ' + e);
  console.error('\n(This is expected until the real production API URL is supplied.)');
  process.exit(1);
}

console.log('✓ Production frontend env looks valid (NEXT_PUBLIC_API_URL is an https /api/v1 URL).');
for (const n of notes) console.log('  note: ' + n);
process.exit(0);
