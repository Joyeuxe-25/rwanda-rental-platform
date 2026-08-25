# Production Go-Live Checklist — Rwanda Rental Platform Backend

> Work top-to-bottom with [DEPLOYMENT.md](DEPLOYMENT.md). **External actions
> stay unchecked until you actually complete them** — do not pre-check anything
> that depends on Cloudflare/GitHub/legal steps. Items marked _(prepared)_ are
> already done in the repository by phase B16.

The three readiness states are independent — **do not** collapse them:

- **CODE READY** — tests/build/lint/format/docs/config validation pass in the repo.
- **INFRASTRUCTURE READY** — Cloudflare resources, secrets, domain, CORS,
  monitoring, and recovery are configured.
- **LEGAL READY** — external compliance/legal approvals are completed.

---

## A. Code

- [x] _(prepared)_ Full test suite passes (`npm test`).
- [x] _(prepared)_ `npm run typecheck`, `npm run lint`, `npm run format:check` pass.
- [x] _(prepared)_ `npm run build` (`wrangler deploy --dry-run`) succeeds.
- [x] _(prepared)_ `npm run docs:validate` passes (OpenAPI matches source).
- [x] _(prepared)_ Migration chain reproducible from `0000` (`tests/db/migrations.test.ts`).

## B. GitHub

- [x] _(prepared)_ `.gitignore` excludes `.dev.vars`, `.env*`, `node_modules`, `.wrangler`, `dist`, `coverage`, logs, temp files.
- [x] _(prepared)_ No secrets committed (repository secret scan clean).
- [ ] Repository created and code pushed (operator does `git init`/commit/push — **not** done for you).
- [ ] Monorepo layout confirmed (`backend/`, later `frontend/`).

## C. Cloudflare Worker

- [x] _(prepared)_ `env.production` block present with obvious placeholders.
- [ ] `wrangler login` completed.
- [ ] Production Worker name confirmed (`rwanda-rental-platform-api-prod` or your choice).
- [ ] `wrangler deploy --env production` succeeded.

## D. D1

- [ ] Production database created (`wrangler d1 create rwanda_rental`).
- [ ] `database_id` pasted into `wrangler.jsonc` → `env.production`.
- [ ] Migrations applied remotely (`wrangler d1 migrations apply … --remote --env production`).
- [ ] Migration state verified (`wrangler d1 migrations list … --remote`).
- [ ] Time Travel recovery understood (`wrangler d1 time-travel info`).

## E. R2

- [ ] Production bucket created (`wrangler r2 bucket create rwanda-rental-assets`).
- [ ] `ASSETS` binding verified against the production bucket.
- [ ] Bucket is **not** publicly writable.
- [ ] Object recovery strategy decided (R2 versioning if required).

## F. Secrets

- [x] _(prepared)_ Required secret **names** documented (values never in repo).
- [ ] Production secrets set via `wrangler secret put … --env production`.
- [ ] `wrangler secret list --env production` shows the expected names.
- [ ] No secret appears in `wrangler.jsonc`, source, or logs.

## G. Domain / HTTPS

- [ ] Production API custom domain attached (e.g. `api.YOUR_DOMAIN.com`).
- [ ] HTTPS/TLS active (Cloudflare-managed).
- [ ] API base confirmed: `https://api.YOUR_DOMAIN.com/api/v1`.

## H. CORS

- [ ] `FRONTEND_URL` set to the exact production frontend origin (https; not `*`; not localhost).
- [x] _(prepared)_ `Idempotency-Key` allowed for cross-origin payment creation.
- [ ] `npm run validate:production` passes (no placeholders remain).

## I. MTN

- [x] _(prepared)_ Fail-safe: non-production build may target only `sandbox`.
- [ ] Production MTN Collection credentials set as secrets.
- [ ] `MTN_MOMO_TARGET_ENVIRONMENT=mtnrwanda`.
- [ ] HTTPS callback URL registered (includes the callback token).
- [ ] MTN live sandbox verification completed — **PENDING until actually tested**.

## J. Airtel

- [x] _(prepared)_ Airtel remains **DEFERRED** — no provider/endpoint/credentials.
- [ ] Do **not** enable Airtel until its official current API contract is verified.

## K. Monitoring

- [x] _(prepared)_ `observability.enabled: true`.
- [ ] Workers Logs / `wrangler tail` verified in production.
- [ ] Metrics dashboard reviewed (errors, latency, 5xx).
- [ ] Alerting on webhook/payment/auth failures configured (as desired).

## L. Backups / Recovery

- [ ] D1 Time Travel recovery verified (`time-travel info`).
- [ ] D1 restore procedure documented for the team.
- [ ] R2 object recovery strategy in place.
- [ ] Secret re-provisioning runbook available.

## M. Security

- [x] _(prepared)_ Security controls in place (see README "Security & Compliance (B13)").
- [ ] Cloudflare edge **rate limiting / WAF** configured for auth, payments, public reads, webhooks.
- [ ] Secure cookies confirmed in production (HttpOnly + Secure).
- [ ] Logging redaction confirmed in production logs.

## N. Legal / Compliance

- [ ] NCSA/DPO registration obligation reviewed with counsel (Law N° 058/2021).
- [ ] Data-localisation (Art. 50) / cross-border position confirmed.
- [ ] Breach-response process operational (48h/72h statutory windows).
- [ ] Data-subject-rights handling agreed.

## O. Smoke Testing

- [ ] `API_BASE_URL=… npm run smoke:production` passes (health 200, `/users/me` 401).
- [ ] Public property endpoint verified (optional, with a real published id).
- [ ] No real payment performed unless explicitly approved.

## P. Rollback

- [x] _(prepared)_ Rollback procedure documented (Worker versions, D1 corrective/Time Travel, R2).
- [ ] Previous Worker deployment identified before any redeploy.
- [ ] Rollback rehearsed in a safe window (not yet tested against production).

---

### Readiness summary

- **CODE READY:** ✅ (repository preparation complete; all automated checks pass).
- **INFRASTRUCTURE READY:** ⛔ pending the operator's Cloudflare steps above.
- **LEGAL READY:** ⛔ pending external legal/compliance review.
