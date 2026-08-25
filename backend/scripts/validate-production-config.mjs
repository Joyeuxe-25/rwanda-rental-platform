#!/usr/bin/env node
/**
 * B16 production-configuration validator (safe, secret-free).
 *
 * Validates the `env.production` block of `wrangler.jsonc` structurally and
 * checks that no obvious placeholders remain. It NEVER reads or prints secrets
 * (secrets live only in `wrangler secret put`, never in this file). Until the
 * user supplies real production values it FAILS by design (exit 1) — that is the
 * expected pre-deployment state, not a bug. Run via `npm run validate:production`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** Parse JSONC: strip line/block comments (string-aware) and trailing commas, then JSON.parse. */
function parseJsonc(text) {
  let out = '';
  let inStr = false;
  let quote = '';
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += n;
        i++;
        continue;
      }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      out += c;
      continue;
    }
    if (c === '/' && n === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  out = out.replace(/,(\s*[}\]])/g, '$1'); // trailing commas
  return JSON.parse(out);
}

const problems = [];
const warn = [];
const bad = (m) => problems.push(m);

let cfg;
try {
  cfg = parseJsonc(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'));
} catch (e) {
  console.error(`FAIL: cannot parse wrangler.jsonc — ${e.message}`);
  process.exit(1);
}

const prod = cfg.env?.production;
if (!prod) {
  console.error('FAIL: wrangler.jsonc has no env.production block.');
  process.exit(1);
}

const isPlaceholder = (v) =>
  typeof v !== 'string' || /REPLACE_WITH|PLACEHOLDER|YOUR_|EXAMPLE/i.test(v) || v.trim() === '';

// --- Worker name -----------------------------------------------------------
if (!prod.name || isPlaceholder(prod.name)) bad('env.production.name is missing or a placeholder.');

// --- ENVIRONMENT -----------------------------------------------------------
if (prod.vars?.ENVIRONMENT !== 'production')
  bad('env.production.vars.ENVIRONMENT must be "production".');

// --- FRONTEND_URL (CORS origin) --------------------------------------------
const fe = prod.vars?.FRONTEND_URL;
if (isPlaceholder(fe))
  bad('FRONTEND_URL is still a placeholder — set the exact production frontend origin.');
else if (fe === '*') bad('FRONTEND_URL must not be "*".');
else if (/localhost|127\.0\.0\.1/.test(fe))
  bad('FRONTEND_URL must not be localhost in production.');
else if (!/^https:\/\//.test(fe)) bad('FRONTEND_URL must be an https:// origin.');

// --- D1 --------------------------------------------------------------------
const d1 = prod.d1_databases?.[0];
if (!d1) bad('env.production.d1_databases is missing.');
else {
  if (d1.binding !== 'DB') bad('D1 binding must be "DB".');
  if (isPlaceholder(d1.database_id))
    bad(
      'D1 database_id is still a placeholder — create it with `wrangler d1 create` and paste the id.',
    );
  else if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d1.database_id)
  ) {
    bad('D1 database_id does not look like a Cloudflare UUID.');
  }
  if (!d1.migrations_dir) warn.push('D1 migrations_dir is not set (defaults to "migrations").');
}

// --- R2 --------------------------------------------------------------------
const r2 = prod.r2_buckets?.[0];
if (!r2) bad('env.production.r2_buckets is missing.');
else {
  if (r2.binding !== 'ASSETS') bad('R2 binding must be "ASSETS".');
  if (isPlaceholder(r2.bucket_name)) bad('R2 bucket_name is still a placeholder.');
}

// --- Observability ---------------------------------------------------------
if (prod.observability?.enabled !== true)
  warn.push('observability.enabled is not true (recommended for Workers Logs/metrics).');

// --- Secret hygiene (names only; values are NEVER in this file) -------------
const REQUIRED_PROD_SECRET_NAMES = [
  'MTN_MOMO_BASE_URL',
  'MTN_MOMO_SUBSCRIPTION_KEY',
  'MTN_MOMO_API_USER',
  'MTN_MOMO_API_KEY',
  'MTN_MOMO_TARGET_ENVIRONMENT',
  'MTN_MOMO_CALLBACK_TOKEN',
];
const raw = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8');
for (const name of REQUIRED_PROD_SECRET_NAMES) {
  if (raw.includes(`"${name}"`))
    bad(
      `Secret ${name} must NOT appear in wrangler.jsonc — set it with \`wrangler secret put ${name} --env production\`.`,
    );
}
// MTN production target, if declared as a non-secret var, must be Rwanda's id.
if (prod.vars && 'MTN_MOMO_TARGET_ENVIRONMENT' in prod.vars) {
  bad('MTN_MOMO_TARGET_ENVIRONMENT is a secret; do not put it in vars. Use `wrangler secret put`.');
}

// --- Report ----------------------------------------------------------------
for (const w of warn) console.error(`  warn: ${w}`);
if (problems.length) {
  console.error(`\nProduction config NOT READY — ${problems.length} value(s) still to supply:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '\nThis is EXPECTED until you complete docs/DEPLOYMENT.md. No secrets were read or printed.',
  );
  process.exit(1);
}
console.log(
  'Production config READY: env.production is fully populated with real (non-placeholder) values.',
);
console.log(
  `Reminder: set these secrets separately (names only): ${REQUIRED_PROD_SECRET_NAMES.join(', ')}.`,
);
