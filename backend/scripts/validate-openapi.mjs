#!/usr/bin/env node
/**
 * B15 OpenAPI validator (dependency-free).
 *
 * Validates `openapi.json` structurally and — crucially — checks it against the
 * ACTUAL source routes so documentation can never silently drift from the
 * implementation. Also scans for accidentally-committed secrets. Exits non-zero
 * with a clear message on any failure. Run via `npm run docs:validate`.
 *
 * The source code is the authoritative API contract; this script enforces that
 * the spec matches it exactly (no missing routes, no fictional routes).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const errors = [];
const fail = (msg) => errors.push(msg);

// --- Load + parse -----------------------------------------------------------
const SPEC_PATH = join(ROOT, 'openapi.json');
let raw;
try {
  raw = readFileSync(SPEC_PATH, 'utf8');
} catch {
  console.error(`FAIL: cannot read ${SPEC_PATH}`);
  process.exit(1);
}
let doc;
try {
  doc = JSON.parse(raw);
} catch (e) {
  console.error(`FAIL: openapi.json is not valid JSON — ${e.message}`);
  process.exit(1);
}

// --- Structural checks ------------------------------------------------------
if (doc.openapi !== '3.1.0') fail(`openapi must be "3.1.0" (got ${JSON.stringify(doc.openapi)})`);
if (!doc.info?.title) fail('info.title is required');
if (!doc.info?.version) fail('info.version is required');
if (!Array.isArray(doc.servers) || doc.servers.length === 0)
  fail('servers must be a non-empty array');
if (!doc.components?.securitySchemes?.cookieAuth)
  fail('components.securitySchemes.cookieAuth is required');
else {
  const s = doc.components.securitySchemes.cookieAuth;
  if (s.type !== 'apiKey' || s.in !== 'cookie' || s.name !== 'rrp_session') {
    fail('cookieAuth must be apiKey in cookie named rrp_session');
  }
}
if (!doc.paths || typeof doc.paths !== 'object') fail('paths is required');

// --- $ref resolution --------------------------------------------------------
function resolvePointer(root, ref) {
  if (!ref.startsWith('#/')) return undefined; // only local refs are used
  const parts = ref
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = root;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in node) node = node[p];
    else return undefined;
  }
  return node;
}
function walkRefs(node, path = '$') {
  if (Array.isArray(node)) node.forEach((v, i) => walkRefs(v, `${path}[${i}]`));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') {
        if (resolvePointer(doc, v) === undefined) fail(`unresolved $ref "${v}" at ${path}`);
      } else walkRefs(v, `${path}.${k}`);
    }
  }
}
walkRefs(doc);

// --- Operation-level checks + documented route inventory --------------------
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
const documented = new Set(); // "METHOD path"
const operationIds = new Set();
for (const [p, item] of Object.entries(doc.paths ?? {})) {
  if (!p.startsWith('/')) fail(`path must start with "/": ${p}`);
  for (const [method, op] of Object.entries(item)) {
    if (!HTTP_METHODS.includes(method)) continue;
    documented.add(`${method.toUpperCase()} ${p}`);
    if (!op.responses || Object.keys(op.responses).length === 0)
      fail(`${method.toUpperCase()} ${p}: no responses`);
    if (!op.operationId) fail(`${method.toUpperCase()} ${p}: missing operationId`);
    else if (operationIds.has(op.operationId)) fail(`duplicate operationId ${op.operationId}`);
    else operationIds.add(op.operationId);
    if (!Array.isArray(op.tags) || op.tags.length === 0)
      fail(`${method.toUpperCase()} ${p}: missing tags`);
  }
}

// --- Drift check: documented routes MUST equal actual source routes ---------
// Mount prefixes come from src/routes/v1/index.ts (kept in sync here).
const MOUNTS = [
  ['health.routes.ts', '/health'],
  ['auth.routes.ts', '/auth'],
  ['users.routes.ts', '/users'],
  ['property-images.routes.ts', '/properties'],
  ['properties.routes.ts', '/properties'],
  ['rental-requests.routes.ts', '/rental-requests'],
  ['rentals.routes.ts', '/rentals'],
  ['payments.routes.ts', '/payments'],
  ['notifications.routes.ts', '/notifications'],
  ['payment-webhooks.routes.ts', '/payment-webhooks'],
];
const ROUTES_DIR = join(ROOT, 'src', 'routes', 'v1');
const actual = new Set();
const routeRe = /\.(get|post|put|patch|delete)\(\s*'([^']*)'/gs;
for (const [file, prefix] of MOUNTS) {
  let src;
  try {
    src = readFileSync(join(ROUTES_DIR, file), 'utf8');
  } catch {
    fail(`route file missing: ${file}`);
    continue;
  }
  let m;
  while ((m = routeRe.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    let sub = m[2];
    const full = ('/api/v1' + prefix + (sub === '/' ? '' : sub)).replace(
      /:([A-Za-z0-9_]+)/g,
      '{$1}',
    );
    actual.add(`${method} ${full}`);
  }
}
// Sanity: we should have discovered a reasonable number of routes.
if (actual.size < 40) fail(`route scan found only ${actual.size} routes — parser likely broke`);

for (const r of actual)
  if (!documented.has(r)) fail(`DRIFT: route exists in code but is NOT documented → ${r}`);
for (const r of documented)
  if (!actual.has(r)) fail(`DRIFT: documented route does NOT exist in code → ${r}`);

// --- No fictional Airtel endpoint; Airtel marked deferred -------------------
for (const p of Object.keys(doc.paths ?? {})) {
  if (/airtel/i.test(p)) fail(`fictional Airtel path documented: ${p}`);
}
if (!JSON.stringify(doc).includes('DEFERRED')) fail('AIRTEL_MONEY deferred status not documented');

// --- Secret scan ------------------------------------------------------------
const SECRET_PATTERNS = [
  /MTN_MOMO_API_KEY\s*[:=]\s*["'][^"']+["']/i,
  /MTN_MOMO_SUBSCRIPTION_KEY\s*[:=]\s*["'][^"']+["']/i,
  /MTN_MOMO_CALLBACK_TOKEN\s*[:=]\s*["'][^"']+["']/i,
  /Bearer\s+[A-Za-z0-9._-]{16,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /rrp_session=[A-Za-z0-9._-]{16,}/,
];
for (const re of SECRET_PATTERNS) {
  if (re.test(raw)) fail(`possible secret matching ${re} found in openapi.json`);
}

// --- Report -----------------------------------------------------------------
if (errors.length) {
  console.error(`OpenAPI validation FAILED (${errors.length} problem(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `OpenAPI 3.1.0 valid: ${documented.size} operations, ${operationIds.size} operationIds, ` +
    `${actual.size} source routes — documented set matches source exactly. No secrets found.`,
);
