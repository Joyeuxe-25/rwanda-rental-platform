# Frontend Deployment & Handoff (F10)

> **Nothing in this document has been deployed by Claude Code.** It is a
> handoff: the operator performs every deploy step from their own terminal,
> Vercel account, and Cloudflare account. All domains below are **placeholders**
> — replace `YOUR_DOMAIN.com` with the real registrable domain.

## 1. Production architecture

```
Browser
  │  HTTPS
  ▼
Vercel  ──  Next.js frontend      (this app, root dir = frontend/)
  │  HTTPS  →  NEXT_PUBLIC_API_URL
  ▼
Cloudflare Worker  ──  backend API   (../backend, deployed separately)
  ├── D1  (SQLite)
  └── R2  (property images)
```

- The **frontend never** talks to D1, R2, MTN, or Airtel. It calls only the
  backend API base (`NEXT_PUBLIC_API_URL`).
- Backend deployment (Worker + D1 + R2 + MTN secrets) is documented separately in
  [`../backend/docs/DEPLOYMENT.md`](../backend/docs/DEPLOYMENT.md) and must be done
  **first** (see the deployment order below).

## 2. Domains (placeholders)

| Piece    | Origin                               | Host       |
| -------- | ------------------------------------ | ---------- |
| Frontend | `https://www.YOUR_DOMAIN.com`        | Vercel     |
| Backend  | `https://api.YOUR_DOMAIN.com`        | Cloudflare |
| API base | `https://api.YOUR_DOMAIN.com/api/v1` | —          |

`www.` and `api.` are **subdomains of the same registrable domain**, i.e.
**same-site** — which the current cookie strategy supports (see §6).

## 3. Environment variables (frontend)

The frontend needs exactly **one public** variable. It is browser-visible by
design — **it is not a secret** (the API base URL is public). **Never** put
provider/database/Cloudflare secrets in any `NEXT_PUBLIC_*` variable.

| Variable              | Development                    | Production                           |
| --------------------- | ------------------------------ | ------------------------------------ |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | `https://api.YOUR_DOMAIN.com/api/v1` |

- Local: copy [`.env.example`](.env.example) → `.env.local` (already gitignored).
- Production/Preview: set in **Vercel → Project → Settings → Environment
  Variables** (do **not** commit it).

Validate a candidate value (never prints secrets, fails on placeholder/localhost):

```bash
NEXT_PUBLIC_API_URL=https://api.YOUR_DOMAIN.com/api/v1 npm run validate:production-env
```

## 4. GitHub (operator runs these — Claude Code does not)

The repo is a monorepo (`backend/` + `frontend/`) suitable for one GitHub repo.

```bash
git init
git add .
git commit -m "Rwanda Rental Platform"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `.env.*` (keeping `.env.example`),
`.dev.vars*`, `node_modules`, `.next`, `.vercel`, coverage, and build output.

## 5. Vercel project (operator)

1. **New Project** → import the GitHub repo.
2. **Root Directory = `frontend`** (critical — do not build at the repo root, or
   Vercel would try to build the backend too).
3. Framework preset: **Next.js** (auto-detected; no `vercel.json` is needed).
4. Build command: `npm run build` · Install: `npm ci` · Output: Next.js default.
5. Node.js: **20+** (matches `package.json` `engines`).
6. Environment variables → add `NEXT_PUBLIC_API_URL` (Production = the real API
   base; Preview = a staging API base if one exists; Development =
   `http://localhost:4000/api/v1`).
7. Deploy from the Vercel dashboard (or `vercel --prod` from **your** machine).

The frontend uses **no** Vercel serverless API routes — `/api/*` is served by the
Cloudflare Worker, not Next.js.

## 6. Cookies / session

The backend issues an **HttpOnly**, `Path=/`, `SameSite=Lax`, `Secure` (in prod)
session cookie (`rrp_session`). With `www.YOUR_DOMAIN.com` (frontend) and
`api.YOUR_DOMAIN.com` (backend) as **same-site subdomains**, the credentialed
requests (`fetch(..., { credentials: 'include' })`) carry the cookie correctly.

> If you instead place the frontend and API on **different sites** (e.g. the
> Vercel `*.vercel.app` origin against `api.YOUR_DOMAIN.com`), the cookie is
> **cross-site**: the backend must set `SESSION_SAMESITE=None` (and `Secure`, over
> HTTPS), with appropriate CSRF controls. **Do not** change backend config here —
> this is a backend/operator decision documented for awareness.

## 7. CORS (backend `FRONTEND_URL`)

The backend allows exactly one frontend origin via `FRONTEND_URL` with
`credentials: true`. Set it to the **exact** production frontend origin:

```
FRONTEND_URL=https://www.YOUR_DOMAIN.com
```

Not `*`, not a wildcard subdomain, not `http://localhost:3000`. The backend CORS
already allows the `Idempotency-Key` and `X-Request-Id` headers (needed for
payments). Preview deployments use per-deploy Vercel URLs — either add a staging
`FRONTEND_URL` for a staging backend, or test previews against a staging API.

## 8. HTTPS

Both origins must be **HTTPS** in production (Vercel + Cloudflare provide TLS).
No production URL may use `http://` (localhost dev only). Do not run
authentication or payment tests until TLS is active on both origins.

## 9. Recommended deployment order

1. Backend infra: Cloudflare **D1** + **R2** created, migrations applied
   (`--remote`), secrets set (`wrangler secret put …` — MTN etc.).
2. Deploy the **Worker**; attach the `api.YOUR_DOMAIN.com` custom domain.
3. Set backend `FRONTEND_URL` (CORS) + cookie config; backend smoke test.
4. Push to **GitHub**.
5. Create the **Vercel** project (root = `frontend`); set `NEXT_PUBLIC_API_URL`.
6. **Deploy** the frontend; attach `www.YOUR_DOMAIN.com`.
7. Frontend smoke: `FRONTEND_URL=https://www.YOUR_DOMAIN.com npm run smoke:production`.
8. Manual smoke: auth → marketplace → rental request → rental → **payment
   initiation (PENDING)** → notifications. Do **not** expect `SUCCESSFUL` unless
   MTN production is configured and the provider confirms it.
9. Monitoring + rollback readiness.

## 10. Smoke tests

- **Frontend (this repo):** `FRONTEND_URL=https://www.YOUR_DOMAIN.com npm run
smoke:production` — read-only; checks `/` and `/properties` return 200 and that
  `/account` does not leak private content anonymously. It never logs in or writes.
- **Backend/API health:** see `../backend/docs/DEPLOYMENT.md` (`smoke:production`).
- **Preflight (no deploy):** `npm run deploy:production` validates the env and
  prints the manual steps — it **never** deploys.

## 11. Rollback

- **Frontend:** Vercel → Deployments → pick the previous good deployment →
  **Promote to Production** (instant). Or `vercel rollback` from your machine.
- **Backend:** `wrangler deployments list` / `wrangler rollback`; D1 has
  Time-Travel PITR (see backend docs).
- Because the frontend is stateless (all state is in the backend), a frontend
  rollback is safe and does not affect data.

## 12. Troubleshooting

| Symptom                             | Likely cause / fix                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| All API calls fail / CORS error     | `FRONTEND_URL` (backend) ≠ the exact Vercel origin.                             |
| Logged in but immediately anonymous | Cookie not sent — cross-site without `SESSION_SAMESITE=None`, or missing HTTPS. |
| "We're having trouble connecting…"  | Backend unreachable / wrong `NEXT_PUBLIC_API_URL`.                              |
| `/api/*` returns Next.js 404        | Frontend is calling itself — check `NEXT_PUBLIC_API_URL`.                       |
| Vercel builds the backend too       | Root Directory not set to `frontend`.                                           |
| Payments never leave PENDING        | Expected until MTN production is configured on the backend.                     |

## 13. Status & limitations

- **MTN sandbox: not exercised** (no local credentials) — payment initiation
  returns `PENDING`; success is never fabricated. Live confirmation requires MTN
  production onboarding on the backend.
- **Airtel: deferred** — disabled in the UI; no frontend Airtel code/keys.
- **npm audit:** advisories exist only in framework/dev-build tooling (Next.js
  dev server, vitest→esbuild/vite, sharp/libvips) — not application code; clearing
  them needs breaking major upgrades (tracked separately). `npm audit fix --force`
  is not run.
- This document is a **handoff**. Production is verified only after the operator
  deploys with real HTTPS domains and runs the smoke tests above.
