# Rwanda Rental Platform — Frontend

> **Status: F10 ✅ PRODUCTION PREPARATION & DEPLOYMENT HANDOFF.**
> The complete, QA-verified frontend (F0–F9) prepared for a Vercel deployment
> against the Cloudflare Workers backend: a public `NEXT_PUBLIC_API_URL` config,
> a production env validator, a read-only frontend smoke script, a non-deploying
> deploy guard, and a full [`DEPLOYMENT.md`](DEPLOYMENT.md) (GitHub → Vercel →
> CORS/cookies/HTTPS → smoke → rollback). **FRONTEND PRODUCTION HANDOFF READY** —
> **Claude Code deployed nothing**; the operator deploys manually. **Airtel Money
> remains deferred.** MTN production remains an operator/backend task.

The frontend calls the existing backend API (Cloudflare Workers) over HTTPS
using **cookie-based** authentication. The backend lives in
[`../backend`](../backend) and is the authoritative API contract
([`../backend/openapi.json`](../backend/openapi.json)).

## Stack

| Concern     | Choice                                        |
| ----------- | --------------------------------------------- |
| Framework   | Next.js (App Router)                          |
| Language    | TypeScript (strict)                           |
| UI runtime  | React                                         |
| Styling     | Tailwind CSS                                  |
| Components  | shadcn/ui (Radix primitives + CVA)            |
| Icons       | lucide-react                                  |
| Fonts       | Outfit (display) + Inter (body) via next/font |
| Testing     | Vitest + React Testing Library                |
| Lint/format | ESLint (next) + Prettier                      |

## Local setup

```bash
cd frontend
npm install
cp .env.example .env.local     # then adjust NEXT_PUBLIC_API_URL if needed
npm run dev                    # http://localhost:3000
```

The backend runs separately (`cd ../backend && npm run dev` → `http://localhost:4000`).

## Commands

```bash
npm run dev          # start the dev server (:3000)
npm run build        # production build
npm run start        # serve the production build
npm run lint         # ESLint (next lint)
npm run format       # Prettier write
npm run format:check # Prettier check
npm run typecheck    # tsc --noEmit
npm test             # Vitest (run once)
npm run test:watch   # Vitest watch

# Production preparation (F10) — none of these deploy
npm run validate:production-env   # fail-safe check of NEXT_PUBLIC_API_URL
npm run smoke:production          # read-only smoke of a deployed FRONTEND_URL
npm run deploy:production         # preflight + prints manual steps (never deploys)
```

## Production deployment (F10)

The frontend is **prepared for a Vercel deployment** against the Cloudflare
Workers backend, but **Claude Code deployed nothing** — the operator runs GitHub /
Vercel / Cloudflare steps from their own accounts. The full runbook (architecture,
GitHub push, Vercel project with **Root Directory = `frontend`**, `NEXT_PUBLIC_API_URL`,
CORS `FRONTEND_URL`, cookie/HTTPS notes, deployment order, smoke tests, rollback,
troubleshooting) is in **[`DEPLOYMENT.md`](DEPLOYMENT.md)**.

Key points:

- **One public var:** `NEXT_PUBLIC_API_URL` (e.g. `https://api.YOUR_DOMAIN.com/api/v1`) —
  browser-visible, **not a secret**. No `NEXT_PUBLIC_*` may hold a provider/DB/CF
  secret (the validator enforces this).
- **Same-site cookies:** `www.` (frontend) and `api.` (backend) subdomains keep the
  HttpOnly `rrp_session` cookie working with `credentials: 'include'`. A truly
  cross-site split would need backend `SESSION_SAMESITE=None` + HTTPS (a backend
  decision, unchanged here).
- **HTTPS** required on both origins in production. The frontend calls only
  `NEXT_PUBLIC_API_URL` — never D1/R2/MTN/Airtel directly; `/api/*` is **not** a
  Next.js route.
- **MTN:** sandbox not exercised locally (no creds) — payment initiation is
  `PENDING`, never a fabricated success. **Airtel:** deferred.
- Backend deployment is documented separately in
  [`../backend/docs/DEPLOYMENT.md`](../backend/docs/DEPLOYMENT.md); deploy the
  backend first.

## Environment

| Variable              | Purpose                     | Example                        |
| --------------------- | --------------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_URL` | Backend API base (with /v1) | `http://localhost:4000/api/v1` |

Only `NEXT_PUBLIC_*` values reach the browser. **There are no secrets in the
frontend** — authentication is server-side via the backend's HttpOnly
`rrp_session` cookie. The client never stores tokens (no localStorage/JWT).

## Directory structure

```
frontend/
├── app/                 # App Router: layout, page, /design-system, loading, error, not-found
├── components/
│   ├── ui/              # primitives: button, input, label, textarea, checkbox, card, badge,
│   │                    #   status-badge, alert, separator, skeleton, breadcrumb, form-field,
│   │                    #   sheet, dialog, tooltip
│   ├── layout/          # AppShell, SiteHeader, MainNav, MobileNav, NavLink, SiteFooter,
│   │                    #   SkipLink, PageContainer, Section, Stack/Inline, Grid
│   ├── shared/          # LoadingState + CardSkeleton/TextSkeleton, EmptyState, ErrorState
│   └── branding/        # Logo / BrandMark
├── lib/                 # utils (cn), env, api client, nav (navigation config)
├── hooks/               # (reserved for later phases)
├── types/               # ApiResponse / ApiError / Pagination foundations
├── tests/               # Vitest: foundation, shell, ui
├── public/
├── components.json      # shadcn/ui config
├── tailwind.config.ts   # semantic tokens → CSS variables
└── .env.example
```

## Authentication & accounts (F3)

Authentication is **cookie-based** and the backend is the source of truth. On
mount, `AuthProvider` calls `GET /api/v1/auth/me` (credentialed) to hydrate —
`200` → authenticated, `401` → unauthenticated. **No tokens are ever stored on
the client** (no localStorage/sessionStorage/JWT); the browser holds the
backend's **HttpOnly `rrp_session` cookie**, which JavaScript cannot read.

### Pages (all `noindex`)

- **`/login`**, **`/register`** — cookie session on success; both honor a safe
  `returnTo`. Registration auto-logs-in and uses the **server-returned role**.
- **`/forgot-password`** — always shows a generic message (never reveals whether
  an email exists); any dev reset token is ignored.
- **`/reset-password`** — consumes the URL `?token` for the reset only (never
  stored/logged); prompts sign-in afterwards (sessions are revoked).
- **`/account`**, **`/account/security`** — **protected** (client `RequireAuth`):
  loading → spinner, unauthenticated → `/login?returnTo=<path>`, authenticated →
  content. `/account` shows name/email/phone/role (read-only); Security changes
  the password (then signs out → `/login`).

### Endpoints consumed

`GET /auth/me`, `POST /auth/login`, `POST /auth/register`, `POST /auth/logout`,
`POST /auth/forgot-password`, `POST /auth/reset-password`,
`POST /auth/change-password` — all via the F0 client (`credentials: 'include'`).
**No business write endpoints** (rental-requests/payments/…) are called.

### State, header & CTA

`components/auth/auth-provider.tsx` exposes `useAuth()` (`user`, `status`,
`refresh`, `setUser`, `signOut`). The header (`AuthNav`) and mobile menu show
**Sign in / Create account** when anonymous and, when authenticated, a
role-appropriate requests link (**My requests** for a tenant, **Rental requests**
for a landlord) plus **Account / Sign out** (a brief skeleton during hydration
avoids a flash). The **Request to Rent** CTA behaviour is documented under
[Rental request flow (F4)](#rental-request-flow-f4).

### `returnTo` safety

`safeInternalPath()` allows only internal relative paths (single leading `/`,
non-`//`, no backslashes/whitespace, no `javascript:`/`data:` schemes) —
blocking open redirects like `https://evil`, `//evil`, or `javascript:…`.

### Local backend requirement

Auth requires the backend running at `NEXT_PUBLIC_API_URL` (default
`http://localhost:4000/api/v1`). Note `localhost:3000` and `:4000` are the same
_site_, so the `SameSite=Lax` cookie flows on credentialed requests. The anonymous
`/auth/me` hydration returns `401` (logged by the browser as a benign network
`401`) and is handled gracefully — it is not an application error.

## Rental request flow (F4)

Connects an authenticated tenant to the approved **B6** rental-request API and
gives a landlord the tools to review requests for their own properties. All calls
reuse the F0 client (`credentials: 'include'`, cookie only — no JWT/Bearer, no
token storage). Reads use `no-store` so lists/detail are always fresh.

### Request creation (tenant)

- **`/properties/:id/request`** (`noindex`) — tenant-only. Loads the property
  **fresh** (`getPublicProperty(id, { fresh: true })`) because availability may
  have changed since the detail page; only an `AVAILABLE` property shows the form.
- Submits **`POST /rental-requests`** with **only** `{ propertyId, message? }`
  (message optional, ≤1000 chars). The tenant identity is derived by the backend —
  the frontend never sends `tenantId`/`landlordId`/`status`/`id`. A ref guard
  prevents double-submission.
- On `201` it shows a **PENDING** confirmation ("Rental request sent", waiting for
  the landlord) — it never claims the rental is confirmed — with a **View my
  requests** CTA.

### Tenant requests

- **`/requests`** — list of the tenant's own requests (`GET /rental-requests/mine`):
  property, rent, location, status, submitted date. Empty state links to the
  marketplace.
- **`/requests/:id`** — one request (`GET /rental-requests/mine/:id`): property,
  status, a lifecycle **timeline**, submitted/updated dates, the message, and a
  **Cancel request** action **only when PENDING**. Cancelling opens a confirmation
  dialog and calls **`PATCH /rental-requests/mine/:id/cancel`**; on a conflict it
  re-syncs the authoritative state (no optimistic terminal mutation).

### Landlord requests

- **`/landlord/requests`** — requests for the landlord's own properties
  (`GET /rental-requests/landlord`): property, tenant **name only** (no contact
  details), rent, status, submitted date.
- **`/landlord/requests/:id`** — one request (`GET /rental-requests/landlord/:id`)
  with **Approve** / **Reject** controls **only when PENDING**. Approve calls
  **`PATCH …/approve`** (→ `ACCEPTED`); Reject uses a confirmation dialog and calls
  **`PATCH …/reject`** (→ `REJECTED`). An already-processed conflict re-fetches and
  shows the current state.

### Request state machine

`PENDING → ACCEPTED | REJECTED | CANCELLED` (the terminal states cannot
transition). The frontend only mirrors backend state — buttons are UX controls,
the backend is authoritative and enforces every transition atomically. Safe copy
maps the B6 codes (`PROPERTY_NOT_FOUND`, `PROPERTY_NOT_PUBLISHED`,
`PROPERTY_NOT_AVAILABLE`, `RENTAL_REQUEST_ALREADY_EXISTS`,
`RENTAL_REQUEST_NOT_FOUND`, `RENTAL_REQUEST_ALREADY_PROCESSED`,
`RENTAL_REQUEST_CANNOT_BE_CANCELLED`) — raw codes are never shown.

### Authentication & roles

Tenant pages (`/requests*`, `/properties/:id/request`) and landlord pages
(`/landlord/requests*`) are guarded by `RequireRole` (F3 auth model): loading →
skeleton, unauthenticated → `/login?returnTo=<path>`, wrong role → a safe forbidden
message (never the other role's data). All these pages are `noindex`.

### Request-to-Rent CTA

On a property page: not `AVAILABLE` → disabled; signed-out → `/login?returnTo=`
the request page; signed-in **tenant** → `/properties/:id/request`; signed-in
**landlord** → a safe "available to tenants" message. The property page itself
**never** calls `POST` — submission happens on the request page.

### What F4 does NOT do

Accepted requests do not become rentals **within the request flow itself** — that
is the job of the rental lifecycle (F5, below). The F4 request pages call no
payment endpoint and create no notifications; rental conversion is initiated from
the request detail's "Continue to rental" action.

## Rental management & conversion (F5)

Connects an **accepted** rental request to the approved **B7** rental API and gives
each party the tools to run a rental's lifecycle. All calls reuse the F0 client
(`credentials: 'include'`, cookie only — no JWT/Bearer, no token storage) with
`no-store` (rental data is private and never publicly cached). A rental is
distinct from its request: the **request stays ACCEPTED**, the **rental** has its
own `ACTIVE` state.

### Accepted request → rental conversion (tenant)

- The tenant request detail (`/requests/:id`) shows **Continue to rental** only
  when the request is `ACCEPTED`.
- **`/requests/:id/rental`** (`noindex`, tenant-only) verifies the request is
  ACCEPTED and loads the property **fresh** for authoritative rent/deposit and
  availability. It calls **`POST /rentals/from-request/:rentalRequestId`** with at
  most `{ startDate?, endDate? }` — never money, status, or identity (all derived
  server-side). Start must be before end (validated client-side too). A
  confirmation dialog ("Start this rental?") precedes submission; a ref guard
  prevents double-submit.
- On `201` it shows **"Rental activated"** (`ACTIVE`) with a **View rental** link —
  it never mentions payment.

### Tenant rentals

- **`/rentals`** — the tenant's rentals (`GET /rentals/mine`): property, rent,
  location, status, start date; empty state links to the marketplace.
- **`/rentals/:id`** — one rental (`GET /rentals/mine/:id`): property, status, a
  lifecycle **timeline**, rent/deposit/currency, start/end dates, and the landlord
  **name only**. Read-only — the tenant has no lifecycle controls.

### Landlord rentals

- **`/landlord/rentals`** — rentals on the landlord's properties
  (`GET /rentals/landlord`): property, tenant **name only**, rent, status, start
  date.
- **`/landlord/rentals/:id`** — one rental (`GET /rentals/landlord/:id`) with
  **Complete** / **Terminate** controls **only when `ACTIVE`**, each behind a
  confirmation dialog: **`PATCH …/complete`** (→ `COMPLETED`) and
  **`PATCH …/terminate`** (→ `TERMINATED`). A conflict (no longer active)
  re-fetches and shows the current state.

### Rental state machine

`ACTIVE → COMPLETED | TERMINATED` (terminals cannot transition, so no
reactivate/reopen controls exist). The frontend only mirrors backend state.
Conversion marks the property `OCCUPIED`; completing/terminating frees it back to
`AVAILABLE` — all reflected from the backend response, never set by the client.
Safe copy maps the B7 codes (`RENTAL_REQUEST_NOT_ACCEPTED`, `RENTAL_ALREADY_EXISTS`,
`PROPERTY_NOT_PUBLISHED`, `PROPERTY_NOT_AVAILABLE`, `RENTAL_NOT_FOUND`,
`RENTAL_NOT_ACTIVE`) — raw codes are never shown.

### Authorization

Tenant pages (`/rentals*`, `/requests/:id/rental`) require `TENANT`; landlord pages
(`/landlord/rentals*`) require `LANDLORD` — via the same `RequireRole` guard as F4
(loading → skeleton, unauthenticated → login `returnTo`, wrong role → safe
forbidden message). All rental pages are `noindex`.

### What F5 does NOT do

F5 stops at the rental lifecycle. Payment of rent on those rentals is the job of
the payment flow (F6, below); F5 itself makes no `/payments` call.

## Payments & MTN MoMo (F6)

Connects an **ACTIVE** rental to the approved **B8/B10** payment API so a tenant
can pay rent by mobile money. All calls reuse the F0 client (`credentials:
'include'`, cookie only — no JWT/Bearer, no token storage) with `no-store` (payment
data is private, never publicly cached). **The browser never talks to a payment
provider** — MTN Request-to-Pay is initiated server-side; the frontend only reads
the backend's authoritative payment status.

### Payment creation (tenant, ACTIVE rentals only)

- The tenant rental detail shows **Make payment** only when the rental is `ACTIVE`;
  `COMPLETED`/`TERMINATED` show **View payment history** only. The backend also
  re-checks (`RENTAL_NOT_PAYABLE`).
- **`/rentals/:id/pay`** (`noindex`, tenant-only) loads the rental and offers a
  form: **amount** (integer RWF, 1…monthly rent — partial payments allowed,
  over-rent blocked), **payment period** (`YYYY-MM` month picker), and **provider**
  (MTN Mobile Money; Airtel disabled). No payer phone is collected — the backend
  uses the tenant's registered number.
- Submitting calls **`POST /payments`** with only `{ rentalId, amount,
paymentPeriod, provider }` and a unique **`Idempotency-Key` header** — never
  money/status/identity, never the key in the body. A confirmation dialog shows a
  review summary first; a ref guard + stable key prevent double charges.

### Idempotency

A key (`crypto.randomUUID()`) is minted per **parameter set**. Re-submitting the
**same** payment reuses the key (the backend replays the existing intent — no
double charge); changing the amount/period/provider mints a **new** key (a new
intent). On a `409 IDEMPOTENCY_KEY_REUSED` the UI shows safe copy and does not
silently reuse an old key.

### PENDING & asynchronous confirmation

A `201`/`200` yields a **PENDING** intent — the UI shows **"Payment initiated —
waiting for mobile money confirmation"** and **never** claims success. Success only
appears when the backend/provider later reports `SUCCESSFUL`. On the payment detail
a **Refresh status** button re-reads `GET /payments/mine/:id` (explicit refresh —
no aggressive polling). A **`504 PAYMENT_PROVIDER_TIMEOUT`** is treated as
**uncertain**: the UI says the payment could not be confirmed yet, links to check
status, and does **not** auto-create a second payment.

### Payment history & detail

- **`/payments`** / **`/payments/:id`** (tenant): `GET /payments/mine[/:id]` —
  property, amount, period, provider, status, dates, and a safe **reference**
  (`providerTransactionId`, when present). `SUCCESSFUL` shows a receipt; `FAILED`/
  `CANCELLED`/`EXPIRED` offer **Try again** (a fresh intent with a new key).
- **`/landlord/payments`** / **`/landlord/payments/:id`** (landlord):
  `GET /payments/landlord[/:id]` — read-only, tenant **name only**, **no** status
  controls (a landlord can never change a payment).

### Status is server-authoritative

There is **no** client status-mutation endpoint and the frontend never infers
success from a click, a `201`, or a timer. Statuses (`PENDING`, `SUCCESSFUL`,
`FAILED`, `CANCELLED`, `EXPIRED`) are shown by icon + text (never color alone).

### Airtel (deferred) & MTN sandbox

**Airtel Money remains deferred** — shown as **disabled / "Coming soon"**, never
submitted or claimed operational. **MTN live sandbox is NOT exercised** locally
(credentials not configured): `POST /payments` returns a genuine `PENDING` intent
with no external MTN call, which is exactly what the UI represents.

### Authorization & SEO

Tenant pages (`/rentals/:id/pay`, `/payments*`) require `TENANT`; landlord pages
(`/landlord/payments*`) require `LANDLORD` — via the same `RequireRole` guard. All
payment pages are `noindex`.

### What F6 does NOT do

No Airtel integration, no provider secrets, no webhook processing or signature
verification in the browser, no direct MTN/Airtel calls, no payment-status
mutation, no refunds, no dashboards, no property management, and no backend
changes. (In-app notifications for these events are surfaced by F7, below.)

## Notifications & activity center (F7)

Consumes the approved **B12** in-app notification API. All calls reuse the F0
client (`credentials: 'include'`, cookie only — no JWT/Bearer, no token storage)
with `no-store` (private data, never publicly cached). **In-app only** — the
frontend makes no external notification-provider call (no email/SMS/WhatsApp/push)
and never creates notifications; the backend creates them from business events.

### Header bell & unread count

`NotificationProvider` (mounted under `AuthProvider`) holds the authoritative
unread count: it hydrates once when the user becomes authenticated and refreshes
on window focus (event-driven — **no polling**). Failures are swallowed (the count
stays as-is; nothing else breaks). The header **bell** (`AuthNav`, desktop) and the
mobile menu row show an unread badge (capped "9+") with an accessible label
("Notifications, N unread"). Anonymous users see no personalized count.

### Notification center

**`/notifications`** (`noindex`, authenticated — both roles) via
`GET /notifications`: a header with the unread summary + **Mark all as read**,
filters (**All / Unread / Read** + a **type** dropdown mapping the 13 B12 types to
friendly labels), an accessible list, and pagination (`page`/`limit`, filters
preserved across pages, reset to page 1 on filter change). Unread items carry
stronger weight **and** a non-color "Unread" cue; read items are subdued. Empty,
filtered-empty (with **Clear filters**), loading, and error states are all handled.

### Read state & related links

Clicking an unread notification's title (or **Mark as read**) calls
`PATCH /notifications/:id/read` (optimistic update + count decrement; re-syncs on
error); **Mark all as read** calls `PATCH /notifications/read-all` and drops the
count to zero. Each notification deep-links to its related entity **by the current
user's role** — `PROPERTY → /properties/:id`; `RENTAL_REQUEST`, `RENTAL`, `PAYMENT`
→ the tenant or landlord route as appropriate — or renders un-linked when there is
no related entity. The backend still enforces authorization on the target route.
`PAYMENT_INITIATED` is always labelled "Payment initiated", never "successful".

### What F7 does NOT do

No email, SMS, WhatsApp, or push; no Expo/FCM/Firebase; no scheduled reminders,
cron, or queues (the `RENT_REMINDER` type is rendered only if one is actually
received); no notification creation from the frontend; no admin, dashboards, or
backend changes. Airtel Money remains deferred.

## Account, profile & authenticated UX (F8)

Consumes the approved **B3** profile API and consolidates the authenticated
experience. All calls reuse the F0 client (`credentials: 'include'`, cookie only —
no JWT/Bearer, no token storage; the profile read uses `no-store`).

### Account routes (all `noindex`, `RequireAuth`)

A shared `AccountShell` gives every account page a role-aware **account nav**
(sidebar on desktop, stacked on mobile) with a non-color active cue
(`aria-current` + weight + left rail):

- **`/account`** — overview: an initials **avatar**, name, role badge, "Member
  since", email + phone, and links to Edit profile / Security / Sign out.
- **`/account/profile`** — the profile edit form.
- **`/account/security`** — change password + a **Forgot password?** link.

### Profile editing

Editable: **firstName**, **lastName**, **phone**. `PATCH /users/me` sends **only
the changed fields** (never a no-op request, never `role`/`email`/`id`); a dirty
diff drives a disabled Save + "No changes to save" when nothing changed. On
success the form updates the **`AuthProvider`** user (via `setUser`), so the
header name and avatar reflect the change immediately, and shows a success alert.
A `PHONE_ALREADY_IN_USE` conflict maps to safe copy.

### Immutable fields, avatar, no deletion/upload

**Email** and **role** are shown **read-only** (email changes need a verification
flow that doesn't exist yet; role is immutable — no role control, and role is
never sent). The **avatar** is always initials (`UserAvatar`) — the backend
exposes `profileImageKey` but offers **no profile-image upload/serving endpoint**,
so none is fabricated and no R2 key is exposed. There is **no account-deletion**
endpoint, so no delete control exists and deletion is never implied.

### Header & navigation consolidation

The desktop header shows role-aware feature links (active-aware), the notification
bell, and an **avatar + name** link to the account; the mobile menu and account
nav share the same role-aware link set (`roleFeatureLinks`) so a tenant never sees
a landlord path or vice versa. Password change still signs the user out and
redirects to `/login` (B2 revokes sessions).

### API endpoints & security

`GET /users/me`, `PATCH /users/me` (B3) and `POST /auth/change-password` (B2) —
all cookie-credentialed. No password/token is stored or logged; `document.cookie`
is never read for auth; the account pages make no other write calls.

## Full integration & QA (F9)

F9 is a QA/hardening pass — **no new product features**. It verifies the whole
frontend end-to-end and hardens where QA found genuine issues.

### Integrated feature map

Public marketplace + discovery (F2/F2-R) → auth + role-aware nav (F3/F8) → rental
requests (F4) → rentals + lifecycle (F5) → MTN payments (F6) → notifications (F7) →
account/profile (F8). All private routes are `RequireAuth`/`RequireRole` and
`noindex`; all API access goes through the single cookie-credentialed client
(`lib/api.ts`) — no second wrapper, no JWT/Bearer, no token storage.

### E2E journeys (verified live against the local backend)

- **Tenant:** register/login → browse marketplace → property → Request to Rent →
  submit → PENDING → (landlord accepts) → Continue to rental → ACTIVE (property
  OCCUPIED) → Make payment → **PENDING** → refresh → notifications → account →
  logout.
- **Landlord:** login → receive request → approve/reject → view rental →
  complete/terminate (property AVAILABLE) → view payments → notifications →
  account → logout.
- **Authorization matrix:** a tenant is blocked from `/landlord/*` and a landlord
  from tenant-only routes (`/requests`, `/rentals`, `/rentals/:id/pay`); anonymous
  users are redirected to `/login?returnTo=…`.

### Audits

- **Secrets:** no MTN/Airtel/Cloudflare/DB credentials, no `Authorization: Bearer`,
  no `localStorage`/`sessionStorage` credential writes, no `document.cookie` auth
  — the only `MTN_MOMO`/`AIRTEL_MONEY` occurrences are provider **enum values**.
- **API contract:** every `api.*` call maps to a documented B2/B3/B6/B7/B8/B12/B17
  endpoint; no undocumented call; the only `fetch(` is inside `lib/api.ts`.
- **Open redirect:** `safeInternalPath` rejects `https:`/`//`/`javascript:`/`data:`/
  `file:`/`vbscript:`/backslash/whitespace and only allows internal relative paths.
- **Provider isolation:** the browser never calls MTN/Airtel/webhooks/SMTP/etc.

### Commands

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

### Known limitations & production-readiness caveats

- **MTN live sandbox is NOT exercised** (no credentials): `POST /payments` returns
  a real `PENDING` intent with no external call — success is never fabricated.
- **Airtel Money is deferred** (disabled / "Coming soon").
- **`npm audit`:** 8 advisories, all in **framework/dev-build tooling** (Next.js,
  vitest → esbuild/vite, sharp/libvips) — several are dev-server-only; clearing
  them needs breaking major upgrades (deferred; `audit fix --force` intentionally
  not run). No application-code vulnerability.
- The anonymous `/auth/me` hydration logs a benign browser `401` (handled).
- **CODE-QA READY ≠ production-deployed.** Production still requires a production
  backend/D1/R2, secrets, MTN onboarding, domain/HTTPS, Vercel/Cloudflare config,
  WAF/rate-limiting, backups, monitoring, and legal/compliance sign-off.

## Public marketplace (F2)

Routes (all anonymous — no login required):

- **`/`** — marketplace homepage: editorial hero, property **lookup by
  reference**, value props, and a CTA into the marketplace.
- **`/properties`** — **live marketplace**: server-rendered results from
  `GET /api/v1/properties`, with search, filters, sorting, and pagination. The
  results region streams inside a `Suspense` boundary (skeleton while loading);
  the filter bar stays mounted across navigations.
- **`/properties/[id]`** — property **detail**, server-rendered from the backend
  with an image gallery/lightbox, pricing (rent/deposit/other charges), meta
  (type/beds/baths), amenities, human-readable Rwanda location, availability
  `StatusBadge`, landlord **name only**, and the **Request to Rent** CTA. A
  designed not-found page (with `noindex`) renders for unknown/unpublished
  references (real backend 404).

### Backend public APIs consumed

| Endpoint                                             | Use                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/v1/properties`                             | Marketplace list — published-only, filtered/sorted/paginated (revalidate ~30s) |
| `GET /api/v1/properties/:id`                         | Property detail (server-side, revalidated ~60s)                                |
| `GET /api/v1/properties/:propertyId/images/:imageId` | Public image bytes (rendered via `${API_ORIGIN}${image.url}`)                  |

Only these public, read-only endpoints are called. **No write endpoints** are
used anywhere in F2. Data access lives in [`lib/properties.ts`](lib/properties.ts)
and reuses the F0 cookie-credentialed client ([`lib/api.ts`](lib/api.ts)).

### Search, filters, sorting & pagination (F2-R)

All marketplace state lives in the **URL query string** (shareable; browser
back/forward restores it) and only the documented B17 parameter names are ever
sent — junk/undocumented params are dropped by `parsePropertyListParams`.

- **Search** → `q` (explicit submit, not per-keystroke).
- **Filters** (in an accessible `Sheet`, works on all viewports): `province`,
  `district`, `sector`, `cell`, `villageOrArea`, `propertyType`, `status`,
  `minRent`, `maxRent`, `bedrooms`, `bathrooms`. **Apply** updates the URL;
  **Clear** resets to `/properties`.
- **Sort** → `newest` (default) · `rent_asc` · `rent_desc`.
- Any filter/search/sort change **resets the page to 1**.
- **Pagination** uses `pagination.{page,total,totalPages}` — accessible
  server-rendered Prev/Next links that preserve filters; Prev disabled on the
  first page, Next on the last; hidden when there's a single page. The result
  count uses `pagination.total` ("N properties found").
- **Loading**: `PropertyGridSkeleton` via `Suspense`. **Empty**: a friendly
  "No properties found" (+ Clear filters when filters are active) — never
  technical wording. **Error/429**: `ErrorState` with a safe message and a
  single "Try again" (`router.refresh()`, no auto-retry loop).

### Request to Rent

Navigation/intent only — it calls **no** API and submits **no** request. It
opens a dialog explaining that requesting requires a tenant account (a future
phase) and preserves property context; the wording stays "Request to Rent". For
a non-`AVAILABLE` property the action is disabled so it never looks requestable.

### Money & location

`lib/format.ts` formats integer RWF with thousands separators
(`RWF 300,000 / month`), never floats. Location uses the backend's human-readable
province/district/sector/cell/village/additional fields — **no** latitude/longitude.

### Images

Images are rendered from **backend-provided URLs only** (never arbitrary storage
keys). A plain `<img>` in an aspect-ratio box (no layout shift) with lazy loading
and an `onError` fallback is used because images are served by the API at a
dynamic origin; the "no image"/"failed to load" cases show a designed placeholder.

## Application shell & navigation (F1)

`app/layout.tsx` wraps every page in `AppShell` (header + `main#main-content` +
footer) with a keyboard `SkipLink`. The header shows the brand, desktop
navigation (`MainNav` → `NavLink` with active/hover/focus states, active state
conveyed by weight + underline + `aria-current`, not color alone), and a
placeholder **Find a Home** CTA; on mobile it collapses to a `MobileNav` **Sheet**
(Radix Dialog — Escape closes, focus trapped/restored, links close on select).
Navigation items live in [`lib/nav.ts`](lib/nav.ts) and perform no backend
actions. The footer adds Platform/Support/Legal placeholder columns and preserves
the required **NEROXIAFRICA** credit (`target="_blank" rel="noopener noreferrer"`).

Layout primitives: `PageContainer` (content/default/wide/full widths), `Section`
(composable title/description/actions), `Stack`/`Inline`, and `Grid`.

## Design-system showcase

Visit **`/design-system`** (a development reference, not a product page) to see
colors, the type scale, buttons, form controls, cards, badges + status
indicators, alerts, loading/empty/error states, breadcrumb, dialog, and tooltip.
It renders no business data and makes no API calls.

## Typography scale

Semantic HTML headings carry structure; utility classes apply the responsive
visual scale: `.text-display`, `.text-h1`–`.text-h4`, `.text-body-lg`,
`.text-body`, `.text-body-sm`, `.text-caption`, `.text-label`.

## Design system — Organic Modernism

Semantic tokens are defined as CSS variables in [`app/globals.css`](app/globals.css)
and surfaced through Tailwind ([`tailwind.config.ts`](tailwind.config.ts)).
Components use tokens (`bg-primary`, `text-muted-foreground`, `border-border`,
…) — **never raw hex**.

| Token              | Color         | Hex       |
| ------------------ | ------------- | --------- |
| `primary`          | Deep Indigo   | `#273469` |
| `secondary`        | Sage Green    | `#7A9B76` |
| `accent`           | Terracotta    | `#C96A4A` |
| `background`       | Warm Cream    | `#F7F4EE` |
| `card` / surface   | White         | `#FFFFFF` |
| `foreground`       | Deep Charcoal | `#252525` |
| `muted-foreground` | Warm Grey     | `#6B6B63` |
| `border` / `input` | Soft Grey     | `#DDD9D0` |
| `success`          | Success Green | `#3F7D58` |
| `warning`          | Warning Amber | `#C58A32` |
| `destructive`      | Error Red     | `#B84C4C` |

Radius `--radius: 0.75rem`; soft/card shadows; `font-display` (Outfit) for
headings, `font-sans` (Inter) for body. Dark mode is intentionally **not**
implemented in F0 (the approved direction is the warm-light palette).

### shadcn/ui

Configured via [`components.json`](components.json) with CSS variables and the
`@/` alias. Primitives are authored against the project tokens: Button (with
loading state), Input, Label, Textarea, Checkbox, Card, Badge, StatusBadge,
Alert, Separator, Skeleton, Breadcrumb, FormField, Sheet, Dialog, and Tooltip
(Radix under the hood). Add more later with `npx shadcn@latest add <component>`.

## API configuration

[`lib/api.ts`](lib/api.ts) is a thin, typed `fetch` foundation that reads
`NEXT_PUBLIC_API_URL`, sends `credentials: 'include'` (the HttpOnly session
cookie), preserves the backend `{ success, data }` / `{ success, error }`
envelope, and normalizes failures into `ApiRequestError`. It is **not** wired to
any product screen in F0. Domain types are not hand-duplicated — later phases can
generate them from `backend/openapi.json`.

## Backend dependency

This app depends on the backend API but does **not** import backend code, and F0
did not modify the backend. The backend remains the source of truth for the API
contract.

## Accessibility

Semantic landmarks (`header`/`main`/`footer`), a keyboard skip link, visible
focus rings on all interactive elements, labelled/`aria-describedby`-wired form
fields with a required-marker convention, an accessible logo, labelled
navigation regions, an accessible mobile menu (Sheet: Escape closes, focus
trapped/restored), icon-only controls with accessible names, `aria-current` on
the active nav link, status conveyed by icon + text (never color alone), and
`prefers-reduced-motion` handling (CSS-only). Motion is restrained — subtle
hover/underline/menu transitions, no autoplay or parallax.

## Testing

```bash
npm test
```

Vitest + React Testing Library (**192 tests, 16 files**, stable across 3 randomized
runs) cover the shell (header,
desktop nav, mobile menu open/close + keyboard, footer + NEROXIAFRICA, skip link,
breadcrumb semantics, layout primitives), UI primitives (button/badge variants,
loading button, status badges, accessible FormField), the design-system showcase,
the public marketplace, authentication (hydration, protected routes, forms,
`returnTo` safety), the **rental request flow** (create/list/detail/cancel,
approve/reject, role guards, conflict handling), the **rental lifecycle**
(accepted-request → ACTIVE conversion, tenant/landlord list & detail,
complete/terminate, terminal-state handling, conflict re-sync), and the **payment
flow** (active-rental gate, correct POST body + `Idempotency-Key` header, PENDING
never shown as SUCCESSFUL, 409 reuse + 504 timeout handling with no second
payment, refresh/receipt/retry, tenant & landlord history/detail, role guards, and
that no provider/webhook/status-mutation call is made), the **notification
center** (role-aware deep links, unread badge, mark-one/mark-all, filters &
pagination, empty/error states, no polling, and no external-provider call), and
**account & profile** (overview + role-aware nav, avatar initials, profile edit
sending only changed fields with no no-op PATCH, immutable email/role, duplicate-
phone mapping, AuthProvider sync, active-nav, anonymous redirect, and no
image-upload/deletion control), plus an **authorization matrix** (RequireRole /
RequireAuth: matching role renders, wrong role is forbidden without data, anonymous
is redirected with a safe returnTo) and extended open-redirect coverage.
Radix/Next browser APIs are mocked in [`vitest.setup.ts`](vitest.setup.ts).
