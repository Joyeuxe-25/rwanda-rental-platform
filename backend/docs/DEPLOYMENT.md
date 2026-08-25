# Deployment Handoff — Rwanda Rental Platform Backend

> **Prepared by phase B16. This document describes MANUAL steps the operator
> runs from their own terminal and Cloudflare account.** Nothing here was
> executed automatically — no resources were created, no secrets were set, and
> nothing was deployed. **API documentation/preparation complete ≠ production
> go-live.** Work through [PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md)
> alongside this guide.

All commands use current Wrangler syntax. Verify against the official docs
linked at the bottom before running anything.

---

## 1. Architecture

```
GitHub (monorepo)
├── backend/   ──► Cloudflare Workers ──► D1 (SQLite)  [binding: DB]
│                                     └► R2 (objects)  [binding: ASSETS]
└── frontend/  ──► Vercel ──HTTPS──► https://api.YOUR_DOMAIN.com/api/v1
```

- **Backend** runs on **Cloudflare Workers** (this repo). It is **not** hosted on
  Vercel.
- **Frontend** (a later, separate effort) deploys to **Vercel** and calls the
  Worker API over HTTPS. No frontend code exists in this repo.
- **Airtel Money is DEFERRED** — no Airtel provider, credentials, or endpoints
  exist. `AIRTEL_MONEY` is a declared enum only (payment → PENDING intent;
  webhook → `501`). Do not configure Airtel until its official current API
  contract is verified.

**API contract:** the canonical machine-readable spec is
[`../openapi.json`](../openapi.json) (OpenAPI 3.1). In production the base URL
becomes `https://api.YOUR_DOMAIN.com/api/v1` (the spec ships with a
`http://localhost:4000` server for local use). MTN is implemented; Airtel is
documented as deferred. Validate with `npm run docs:validate`.

---

## 2. Prerequisites

- A Cloudflare account with Workers, **D1**, and **R2** enabled.
- Node.js ≥ 20 and npm.
- Wrangler authenticated: `npx wrangler login`.
- (Optional) a finalized production API domain, e.g. `api.YOUR_DOMAIN.com`.
- MTN MoMo **Collection** production credentials (only if enabling live MTN).

---

## 3. Local vs production (never mix them)

|                | Local (dev)                    | Production                               |
| -------------- | ------------------------------ | ---------------------------------------- |
| Command        | `npm run dev` (`wrangler dev`) | `wrangler deploy --env production`       |
| D1             | local emulated                 | remote D1 (real `database_id`)           |
| R2             | local emulated                 | remote bucket                            |
| `ENVIRONMENT`  | `development`                  | `production`                             |
| `FRONTEND_URL` | `http://localhost:3000`        | exact https frontend origin              |
| Secrets        | `.dev.vars` (git-ignored)      | `wrangler secret put … --env production` |
| MTN target     | `sandbox` only                 | `mtnrwanda` (Rwanda)                     |

The code **fails safe**: a non-production `ENVIRONMENT` may only target the MTN
`sandbox`; anything else throws `MTN_UNSAFE_ENVIRONMENT`. A dev build can never
move real money.

---

## 4. Configuration (`wrangler.jsonc`)

The `env.production` block already exists with **obvious placeholders**
(`REPLACE_WITH_*`) that Wrangler rejects at deploy time. Replace them **only**
after creating the resources below. **Never put secrets in `wrangler.jsonc`.**

Validate at any time (reads no secrets, prints none):

```bash
npm run validate:production
```

It **fails by design** until you supply real values — that is expected.

---

## 5. Create production D1

```bash
# 1) Create the database (records a UUID)
npx wrangler d1 create rwanda_rental

# 2) Paste the returned database_id into wrangler.jsonc → env.production.d1_databases[0].database_id

# 3) Apply the migration chain (0000 → latest) to REMOTE D1.
#    Wrangler prompts for confirmation and captures a backup before applying.
npx wrangler d1 migrations apply rwanda_rental --remote --env production

# 4) Verify state
npx wrangler d1 migrations list rwanda_rental --remote --env production
```

Migration safety:

- Apply migrations **in order**; the chain is reproducible from `0000` (proven
  by `tests/db/migrations.test.ts`).
- **Never edit historical migrations.** To change the schema, add a **new**
  corrective migration (`npm run db:generate`), review the SQL, then apply.
- Confirm you are targeting the intended `database_id` before applying.

---

## 6. D1 recovery (Time Travel)

D1 **Time Travel** is always on and provides point-in-time recovery for the last
**30 days** — no setup required.

```bash
# Inspect current bookmark / restore info
npx wrangler d1 time-travel info rwanda_rental --env production

# Restore to a timestamp or a bookmark (restoring does NOT delete older bookmarks)
npx wrangler d1 time-travel restore rwanda_rental --timestamp=<UNIX_OR_ISO8601> --env production
npx wrangler d1 time-travel restore rwanda_rental --bookmark=<BOOKMARK> --env production
```

Do **not** perform a restore as part of setup. No production backup exists until
a production database exists.

---

## 7. Create production R2

```bash
npx wrangler r2 bucket create rwanda-rental-assets
```

- The bucket **must NOT be publicly writable**. The Worker is the sole
  access-control boundary for property images (published-only public reads;
  server-generated object keys; no client-chosen keys).
- Object keys are `properties/<propertyId>/<imageId>/<sanitized-filename>`.
- Deletes are idempotent. If you want object recovery, enable **R2 object
  versioning** on the bucket via the dashboard/API before go-live; do not enable
  destructive lifecycle rules.

---

## 8. Set production secrets (names only — values are yours)

Set each with `wrangler secret put <NAME> --env production` (interactive; the
value is never written to the repo). MTN secrets are required **only** if you
enable live MTN payments.

| Secret name                   | Purpose                                            | Required? |
| ----------------------------- | -------------------------------------------------- | --------- |
| `MTN_MOMO_BASE_URL`           | MTN Collection API base (production host)          | MTN only  |
| `MTN_MOMO_SUBSCRIPTION_KEY`   | Ocp-Apim-Subscription-Key (Collection)             | MTN only  |
| `MTN_MOMO_API_USER`           | API user id (UUID)                                 | MTN only  |
| `MTN_MOMO_API_KEY`            | API key for the API user                           | MTN only  |
| `MTN_MOMO_TARGET_ENVIRONMENT` | Rwanda production id → `mtnrwanda`                 | MTN only  |
| `MTN_MOMO_CALLBACK_TOKEN`     | Shared secret authenticating MTN callbacks         | MTN only  |
| `MTN_MOMO_CALLBACK_URL`       | Optional `X-Callback-Url` (must include the token) | Optional  |

`SESSION_SAMESITE` is an optional non-secret var (`Lax`/`Strict`/`None`); set it
to `None` only if the frontend is on a different site (which forces Secure).

```bash
npx wrangler secret put MTN_MOMO_SUBSCRIPTION_KEY --env production
# …repeat for each required secret…
npx wrangler secret list --env production   # names only
```

---

## 9. CORS (production frontend origin)

Set `env.production.vars.FRONTEND_URL` in `wrangler.jsonc` to the **exact**
production frontend origin (e.g. `https://app.YOUR_DOMAIN.com`). Never `*`,
never `localhost`. CORS is an exact-match single origin with credentials; a
disallowed origin receives no `Access-Control-Allow-Origin`. The
`Idempotency-Key` header is already allowed for cross-origin payment creation.

---

## 10. Deploy the Worker

```bash
npm ci
npm test && npm run typecheck && npm run lint && npm run build && npm run docs:validate
npm run validate:production            # must now PASS
npx wrangler deploy --env production    # ← the actual deploy (you run this)
```

`npm run deploy:production` runs preflight checks and then **stops** with the
manual command — it never deploys on your behalf.

---

## 11. Custom API domain (HTTPS)

Attach a custom domain to the Worker (Cloudflare dashboard → Workers → your
Worker → Triggers → Custom Domains, or via API), e.g. `api.YOUR_DOMAIN.com`.
The API is then `https://api.YOUR_DOMAIN.com/api/v1`. Cloudflare manages TLS.
Point the frontend at this base URL and set `FRONTEND_URL` to the frontend's
origin (not the API's).

If you register an MTN callback URL, it must be the HTTPS domain and include the
callback token, e.g.
`https://api.YOUR_DOMAIN.com/api/v1/payment-webhooks/MTN_MOMO?token=<CALLBACK_TOKEN>`.

---

## 12. Monitoring / observability

`observability.enabled` is on. After deploy:

- **Workers Logs / live tail:** `npx wrangler tail --env production` (or the
  dashboard Logs view). Logs are structured JSON and already redact secrets.
- **Metrics:** Workers dashboard (requests, errors, CPU, latency).
- Watch for: `WEBHOOK_VERIFICATION_FAILED`, `PAYMENT_PROVIDER_ERROR/TIMEOUT`,
  `AUTH_RATE_LIMITED`, and 5xx rates.
- Liveness: `GET /api/v1/health`.

---

## 13. Rate limiting / WAF

Application rate limiting is **per-isolate** (a lightweight guard, not global).
For production, add **Cloudflare Rate Limiting / WAF** rules at the edge for at
least: `/api/v1/auth/login`, `/api/v1/auth/register`,
`/api/v1/auth/forgot-password`, `/api/v1/payments`, the public property/image
reads, and `/api/v1/payment-webhooks/*`. Configure these in the Cloudflare
dashboard/API, not from this repo.

---

## 14. Smoke test (read-only)

```bash
API_BASE_URL=https://api.YOUR_DOMAIN.com npm run smoke:production
# optionally, with a known published property:
API_BASE_URL=https://api.YOUR_DOMAIN.com PUBLIC_PROPERTY_ID=<uuid> npm run smoke:production
```

It only performs safe GETs: `/health` → 200; unauthenticated `/users/me` → 401;
optional public property → 200. It never creates users/rentals/payments and
never calls MTN. Do **not** run a real payment as part of smoke testing unless
explicitly approved.

---

## 15. Rollback

- **Worker:** list deployments and roll back to a previous version.
  ```bash
  npx wrangler deployments list --env production
  npx wrangler rollback --env production            # or: wrangler rollback <VERSION_ID>
  ```
- **D1:** do **not** hand-"undo" a migration. Use a **new corrective migration**,
  or D1 **Time Travel** restore (§6) for data recovery.
- **R2:** preserve data; recover objects via R2 versioning if enabled. Do not add
  destructive lifecycle rules.

Rollback has **not** been tested against production in this repo.

---

## 16. MTN production notes

- Production uses `MTN_MOMO_TARGET_ENVIRONMENT=mtnrwanda` (Rwanda country id — not
  the literal string `production`). The code allow-lists `sandbox` outside
  production and refuses anything else in a non-production build
  (`MTN_UNSAFE_ENVIRONMENT`).
- MTN callbacks are **not** cryptographically signed; `MTN_MOMO_CALLBACK_TOKEN`
  is an **application-level** shared secret (bearer or `?token=`), not an
  MTN-native signature. Treat the residual risk accordingly.
- **MTN live sandbox verification remains PENDING** unless you have actually
  configured and tested real credentials. Do not claim live verification you
  have not performed.

---

## 17. Troubleshooting

- **Deploy rejected on `database_id`** → the placeholder is still in
  `wrangler.jsonc`; paste the real UUID.
- **CORS blocked in the browser** → `FRONTEND_URL` doesn't exactly match the
  frontend origin (scheme + host + port).
- **401 everywhere from the browser** → the client isn't sending credentials
  (cookies), or `SESSION_SAMESITE`/`Secure` don't match a cross-site setup.
- **MTN calls refused at boot** → `MTN_UNSAFE_ENVIRONMENT`: a non-production
  build is pointed at a non-sandbox target.
- **Migration "no migrations to apply"** → already at head; verify with
  `d1 migrations list`.

---

## Official Cloudflare references

- Wrangler commands — https://developers.cloudflare.com/workers/wrangler/commands/
- Wrangler configuration & environments — https://developers.cloudflare.com/workers/wrangler/configuration/ · https://developers.cloudflare.com/workers/wrangler/environments/
- D1 Wrangler commands — https://developers.cloudflare.com/d1/wrangler-commands/
- D1 migrations — https://developers.cloudflare.com/d1/reference/migrations/
- D1 Time Travel — https://developers.cloudflare.com/d1/reference/time-travel/
- R2 CLI — https://developers.cloudflare.com/r2/get-started/cli/
- Worker secrets — https://developers.cloudflare.com/workers/configuration/secrets/
- Custom domains — https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Workers Logs — https://developers.cloudflare.com/workers/observability/logs/
- Rollbacks / versions — https://developers.cloudflare.com/workers/configuration/versions-and-deployments/
