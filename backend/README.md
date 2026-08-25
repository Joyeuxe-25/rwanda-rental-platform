# Rwanda Rental Platform — Backend

REST API backend for the Rwanda Rental Platform, running on **Cloudflare Workers**.

> **Status: PHASE B17 — PUBLIC PROPERTY DISCOVERY API**
>
> B0-R → B16 are complete; **B11 (Airtel Money) is DEFERRED** (official contract
> unverifiable in this environment). B17 is a small **additive** phase that
> closes the F2 frontend gap by adding a public, unauthenticated
> **`GET /api/v1/properties`** discovery endpoint (published-only, filtered,
> paginated, sorted). **289 tests.** One additive index migration (`0009`); no
> other behavior changed, no deployment. See "Public Property Discovery API (B17)".

---

## Architecture

| Concern         | Choice                                 |
| --------------- | -------------------------------------- |
| Runtime         | Cloudflare Workers                     |
| HTTP framework  | Hono                                   |
| Language        | TypeScript (strict)                    |
| Database        | Cloudflare D1 (SQLite)                 |
| DB access       | Drizzle ORM (+ Drizzle Kit migrations) |
| Object storage  | Cloudflare R2 (reserved for later)     |
| Validation      | Zod                                    |
| Tooling         | Wrangler                               |
| Testing         | Vitest                                 |
| Lint / format   | ESLint + Prettier                      |
| Package manager | npm                                    |

API architecture: **REST**, versioned under `/api/v1`.

Request flow:

```
Frontend (localhost:3000)
        │
        ▼
Hono API on Cloudflare Workers (localhost:4000 in dev)
        │
        ├── D1  (binding: DB)      — Drizzle ORM
        └── R2  (binding: ASSETS)  — object storage (later phases)
```

---

## Requirements

- **Node.js** >= 20 and **npm** >= 9
- A Cloudflare account is only needed to **deploy** or to create real D1/R2
  resources. Local development uses Wrangler's built-in emulation.

---

## Installation

```bash
cd backend
npm install
```

Generate Cloudflare Worker types from `wrangler.jsonc` (optional but recommended):

```bash
npm run cf-typegen
```

---

## Configuration

There is **no runtime `.env` file** on Workers. Configuration lives in two places:

- **Non-secret vars** — declared in [`wrangler.jsonc`](wrangler.jsonc) under `"vars"`
  (`ENVIRONMENT`, `FRONTEND_URL`).
- **Secrets** — local: a git-ignored `.dev.vars` file (see
  [`.dev.vars.example`](.dev.vars.example)); deployed:
  `wrangler secret put <NAME>`.

[`.env.example`](.env.example) documents every expected value. No secrets are
required in B0-R.

### Bindings (declared in `wrangler.jsonc`)

| Binding  | Type                | Purpose                                   |
| -------- | ------------------- | ----------------------------------------- |
| `DB`     | D1 (SQLite)         | Application database (schema added in B1) |
| `ASSETS` | R2 (object storage) | Property image bytes (B5)                 |

> `d1_databases[0].database_id` in `wrangler.jsonc` is a **placeholder**. Create
> a real database later with `wrangler d1 create rwanda_rental` and paste the id.
> Local `wrangler dev` does not need a real id.

---

## Local development

```bash
npm run dev
```

Wrangler serves the Worker at **http://localhost:4000** with local D1/R2
emulation. Then:

```bash
curl http://localhost:4000/api/v1/health
```

---

## Scripts

```bash
npm run dev           # wrangler dev (local Worker on :4000)
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
npm run lint:fix      # ESLint --fix
npm run format        # Prettier write
npm run format:check  # Prettier check
npm test              # Vitest (run once)
npm run test:watch    # Vitest watch
npm run build         # wrangler deploy --dry-run (bundle check, no deploy)
npm run cf-typegen    # generate worker-configuration.d.ts from wrangler.jsonc
```

### Database (D1 + Drizzle)

```bash
npm run db:generate         # drizzle-kit generate — SQL migration from src/db/schema
npm run db:migrate:local    # wrangler d1 migrations apply rwanda_rental --local
npm run db:migrate:remote   # apply migrations to remote D1 (requires Cloudflare auth)
npm run db:studio           # drizzle-kit studio
```

Typical local workflow after changing the schema:

```bash
npm run db:generate         # regenerate the migration SQL in ./migrations
npm run db:migrate:local    # apply it to the local (emulated) D1 database
```

---

## Database architecture

The database is **Cloudflare D1** (a **SQLite** engine at the edge), accessed
through **Drizzle ORM** with **Drizzle Kit** for migrations. The schema lives in
`src/db/schema/` (one file per entity, re-exported from `index.ts`), and the
request-scoped client is `getDb(env)` in `src/db/client.ts`
(`env.DB` → Drizzle) — no global mutable connections, suitable for the
serverless Workers runtime.

Conventions (see `src/db/schema/_shared.ts`):

- **IDs** — UUID stored as `TEXT`, generated with `crypto.randomUUID()`. Safe in
  REST URLs and as foreign keys; no central sequence needed on the edge.
- **Timestamps** — `INTEGER` Unix-epoch **milliseconds** (Drizzle `timestamp_ms`
  ↔ JS `Date`); unambiguous and sorts correctly. DB default `unixepoch() * 1000`.
- **Money** — `INTEGER` **whole Rwandan Francs (RWF)**. Never floats. `currency`
  is stored explicitly (default `'RWF'`).
- **Enums** — `TEXT` with a Drizzle `enum` (TS safety) **and** a DB `CHECK`
  constraint (so invalid values are rejected even via raw SQL). SQLite has no
  native enum type; Postgres enum syntax is deliberately avoided.
- **Amenities** — JSON `TEXT` array (SQLite has no array type).

### Entities

1. **users** — LANDLORD or TENANT (no admin role). Unique `email` and `phone`.
   `password_hash` column exists for the data model; authentication is B2.
2. **properties** — each row is exactly one rental unit (no building/units
   hierarchy). Owned by a landlord. Human-readable Rwandan location
   (province/district/sector/cell/village) — no latitude/longitude.
3. **property_images** — R2 object metadata (`object_key`, `url`, `is_primary`);
   binaries live in R2, not D1. Cascades on property delete.
4. **rental_requests** — a tenant's request against a property
   (PENDING/ACCEPTED/REJECTED/CANCELLED). Does not itself create a rental.
5. **rentals** — the authoritative tenant↔property↔landlord relationship
   (ACTIVE/COMPLETED/TERMINATED). Stores **snapshot** rent/deposit.
6. **payments** — belongs to a specific **rental** (MTN_MOMO / AIRTEL_MONEY;
   PENDING/SUCCESSFUL/FAILED/CANCELLED/EXPIRED). No provider integrations here.
7. **notifications** — belongs to one user; typed categories; read state.

### Important business constraints

- **One property = one rental unit** — properties are independent rows.
- **One property = at most one ACTIVE rental** — enforced at the DB level by a
  **partial unique index** on `rentals(property_id) WHERE status = 'ACTIVE'`.
  The `properties.status` field is only a display convenience; the rentals
  index is the source of truth for exclusivity.
- **One tenant = many ACTIVE rentals** — allowed (uniqueness is per-property).
- **A payment belongs to a specific rental** — `payments.rental_id` is required;
  tenant/landlord/property ids are denormalized for reporting.
- **Payment idempotency** — partial unique index on
  `(provider, provider_transaction_id)` where the id is present.

### Migrations & local D1

Migrations are generated by Drizzle Kit into `./migrations` and applied to the
local emulated D1 via Wrangler (see commands above). The remote `database_id`
in `wrangler.jsonc` is still a placeholder; no remote/production database is
created or migrated in B1.

---

## API

- **Base URL (dev):** `http://localhost:4000/api/v1`

### Health endpoint

```
GET /api/v1/health
```

```json
{
  "success": true,
  "data": {
    "message": "Rwanda Rental Platform API is running",
    "status": "ok",
    "environment": "development",
    "timestamp": "2026-08-18T00:00:00.000Z"
  }
}
```

### Response conventions

**Success:**

```json
{ "success": true, "data": {} }
```

**Error:**

```json
{ "success": false, "error": { "message": "...", "code": "..." } }
```

---

## Authentication & authorization (B2)

Server-side sessions with an **HttpOnly cookie**. There are two roles —
**LANDLORD** and **TENANT** (no admin).

### Endpoints (base `/api/v1/auth`)

| Method & path           | Auth | Purpose                                                   |
| ----------------------- | ---- | --------------------------------------------------------- |
| `POST /register`        | —    | Create account (role LANDLORD/TENANT) + auto-login        |
| `POST /login`           | —    | Email + password → session cookie                         |
| `POST /logout`          | ✅   | Revoke the current session, clear the cookie              |
| `GET  /me`              | ✅   | Current user's safe profile                               |
| `POST /change-password` | ✅   | Verify current pw, set new, revoke all sessions, re-issue |
| `POST /forgot-password` | —    | Create a reset token (generic response; no email sent)    |
| `POST /reset-password`  | —    | Consume token, set new password, revoke sessions          |

### Session model

- A session token is 32 random bytes (Web Crypto), sent to the client **only**
  in the cookie. D1 stores only its **SHA-256 hash** (`sessions.token_hash`).
- A session is valid when not expired **and** not revoked. Lifetime: **7 days**.
- Logout sets `revoked_at`; password change/reset revoke **all** of a user's
  sessions. Users may hold multiple concurrent sessions (multi-device); logout
  affects only the current one.

### Cookie behavior

`rrp_session` — `HttpOnly`, `Path=/`, `Max-Age=604800` (7d), `SameSite=Lax`,
`Secure` in production (and whenever SameSite=None). `SameSite=Lax` works for
localhost dev and same-site (subdomain) production. A fully cross-site frontend
must set `SESSION_SAMESITE=None` (which forces `Secure`, i.e. HTTPS).

### Password hashing

**PBKDF2-HMAC-SHA-256** (100k iterations, 16-byte salt) via Web Crypto
(`crypto.subtle`) — Workers-native, no Node/native modules. Stored as
`pbkdf2$sha256$<iters>$<salt>$<hash>`. Password policy: 8–128 chars (length over
composition; no forced character classes).

### Authorization

- `requireAuth` — validates the session cookie and attaches the typed `user`
  and `session` to the Hono context (`c.get('user')`, or `getAuthUser(c)`).
- `requireRole('LANDLORD' | 'TENANT')` — 403 if the authenticated role does not
  match. Authorization identity always comes from the **server-side session**,
  never from client-supplied ids (foundation for future `landlord_id ===
authenticatedUser.id` ownership checks).

### Password reset

Foundation only — **email delivery is NOT implemented**. `forgot-password`
creates a hashed, single-use, 1-hour token and always returns a generic message
(never reveals whether the account exists). For **local dev/test only**
(`ENVIRONMENT !== 'production'`), the response includes a `devResetToken` so the
flow can be exercised; this is never present in production and tokens are never
logged.

### Rate limiting

A minimal in-memory per-isolate foundation guards `login`/`register`/`forgot-
password`. It is **not** distributed (resets on isolate recycling) and is
skipped in the test environment. **Production recommendation:** enforce at the
edge with Cloudflare Rate Limiting rules / WAF, or back it with a Durable
Object / KV.

### Environment / secrets

Uses the existing bindings (`DB`, `ASSETS`, `ENVIRONMENT`, `FRONTEND_URL`); no
new secrets are required in B2. Optional `SESSION_SAMESITE` (`Lax`/`Strict`/
`None`) overrides the cookie SameSite attribute. Add real secrets later via
`wrangler secret put` / `.dev.vars` — never commit them.

### Frontend integration (future)

The frontend is a separate origin, so browser calls to the API must send the
cookie: use `fetch(url, { credentials: 'include' })` (and the API must keep
CORS pinned to `FRONTEND_URL` with credentials enabled — already configured).

### Known limitations

- No email delivery for password reset (deferred).
- Rate limiting is a per-isolate foundation, not distributed (see above).
- CSRF: mitigated by `SameSite` + a JSON/`Content-Type` API; a token-based CSRF
  defense can be added if a cross-site cookie (`SameSite=None`) is adopted.

---

## User profiles (B3)

Self-service profile management for the authenticated user. Ownership is always
derived from the **server-side session** — there is intentionally no
`/users/:id` route, and no client-supplied id is ever trusted. Both roles have
identical access to their own profile.

### Endpoints (base `/api/v1/users`)

| Method & path | Auth | Purpose                                     |
| ------------- | ---- | ------------------------------------------- |
| `GET /me`     | ✅   | Return the authenticated user's own profile |
| `PATCH /me`   | ✅   | Update the authenticated user's own profile |

Response wraps the SafeUser: `{ "success": true, "data": { "user": { … } } }`.
The SafeUser never includes `password_hash`, session tokens, or reset tokens.

### Editable fields

Only `firstName`, `lastName`, and `phone` may be updated. Phone is normalized to
E.164 (`+2507XXXXXXXX`) and must remain unique — a collision returns **409**
`PHONE_ALREADY_IN_USE`. The request is validated with a **strict** Zod schema:

- unknown/disallowed keys → **422** (e.g. `nickname`);
- an empty update object → **422**;
- an invalid phone → **422**.

### Immutable / out-of-scope fields

- **`role`** is immutable — sending it is rejected with **422** (no
  role-management API exists).
- **`email`** is not editable in B3 (would require an email-verification flow
  that does not exist yet).
- **Password** changes remain under the existing B2 endpoint
  **`POST /api/v1/auth/change-password`** — not duplicated here.
- Profile image upload (R2) is deferred to a later phase.

---

## Property management (B4)

**One property = one rental unit** (no building/units hierarchy). Landlords
manage only their **own** properties; ownership is always derived from the
session (`landlordId = authenticatedUser.id`) — a client-supplied `landlordId`
is never trusted (and is rejected by the strict schema). Location uses the
human-readable Rwandan hierarchy (province/district/sector/cell/village) — **no
latitude/longitude**. Money is **integer whole RWF**.

### Endpoints (base `/api/v1/properties`)

| Method & path               | Auth       | Purpose                                 |
| --------------------------- | ---------- | --------------------------------------- |
| `POST /`                    | LANDLORD   | Create a property (starts unpublished)  |
| `GET /mine`                 | LANDLORD   | List own properties                     |
| `GET /mine/:id`             | LANDLORD   | Own property detail                     |
| `PATCH /mine/:id`           | LANDLORD   | Update own property (field allowlist)   |
| `DELETE /mine/:id`          | LANDLORD   | Delete own property (if not referenced) |
| `PATCH /mine/:id/publish`   | LANDLORD   | Make property publicly discoverable     |
| `PATCH /mine/:id/unpublish` | LANDLORD   | Remove from the public marketplace      |
| `GET /:id`                  | **public** | Public detail — **published only**      |

Management routes require `requireAuth` + `requireRole('LANDLORD')`; a TENANT
gets 403, unauthenticated 401. Responses use `data.property` / `data.properties`.

### Publication vs. availability

Publication (`isPublished`, added in migration `0002`) is **orthogonal** to the
B1 `status` (AVAILABLE/OCCUPIED/UNAVAILABLE):

- **Publish** requires complete listing info (notably a non-empty description) —
  otherwise **400** `PROPERTY_INCOMPLETE`. Sets `isPublished = true`.
- **Public visibility** = `isPublished = true`. An unpublished (or unknown)
  property returns **404** `PROPERTY_NOT_FOUND` publicly (no existence leak).
- `status` is **not** landlord-editable here (prevents faking OCCUPIED); a
  property may be published **and** occupied. Occupancy is set by the rental flow
  in a later phase, never by B4.

### Editable fields

`title, description, propertyType (APARTMENT|HOUSE|ROOM|STUDIO|OTHER), bedrooms,
bathrooms, monthlyRent, securityDeposit, otherCharges, province, district,
sector, cell, village, additionalLocation, amenities[]`. Server-controlled
fields (`id`, `landlordId`, `status`, `isPublished`, `currency`, timestamps,
`tenantId`, `rentalId`) are rejected by the strict Zod schema (**422**). Money
and counts must be non-negative integers.

### Public vs. private data

The public detail exposes listing-safe fields plus a minimal landlord identity
(`{ id, firstName, lastName }`) — never the landlord's email, phone, password
hash, or session data, and not the raw `landlordId`.

### Deletion safety

Deleting a property referenced by protected history (e.g. a rental via
`ON DELETE RESTRICT`) returns **409** `PROPERTY_CANNOT_BE_DELETED` — history is
never cascade-deleted, and raw SQL errors are never exposed.

> Property images are managed in **B5** (below).

---

## Property images & R2 (B5)

Image **bytes** live in **Cloudflare R2** (binding `ASSETS`); image **metadata**
lives in D1 (`property_images`). Object keys are **server-generated** —
`properties/{propertyId}/{imageId}/{safeFilename}` — so a client can never
choose an arbitrary key or perform path traversal, and the raw key is never
returned in JSON.

### Endpoints

| Method & path                                                       | Auth       | Purpose                                     |
| ------------------------------------------------------------------- | ---------- | ------------------------------------------- |
| `POST /api/v1/properties/mine/:id/images`                           | LANDLORD   | Upload an image (`multipart`, field `file`) |
| `GET  /api/v1/properties/mine/:id/images`                           | LANDLORD   | List own property's images                  |
| `PATCH /api/v1/properties/mine/:propertyId/images/:imageId/primary` | LANDLORD   | Set the cover image                         |
| `PATCH /api/v1/properties/mine/:propertyId/images/reorder`          | LANDLORD   | Reorder (`{ imageIds: [...] }`)             |
| `DELETE /api/v1/properties/mine/:propertyId/images/:imageId`        | LANDLORD   | Delete image (R2 object + metadata)         |
| `GET  /api/v1/properties/:propertyId/images/:imageId`               | **public** | Image bytes — **published only**            |

Management routes require `requireAuth` + `requireRole('LANDLORD')`; ownership is
enforced in the service (property must belong to the session landlord, image
must belong to the property) — cross-owner access is a generic **404**.

### Upload validation

- **Allowed types:** `image/jpeg`, `image/png`, `image/webp` — detected from the
  file's **magic bytes**, not the client-supplied header/extension (SVG is
  disallowed). Bad type → **415** `IMAGE_TYPE_NOT_ALLOWED`.
- **Max size:** **5 MB** per image → **413** `IMAGE_TOO_LARGE`.
- **Max images per property:** **20** → **409** `IMAGE_LIMIT_REACHED`.
- Missing file → **400** `IMAGE_FILE_REQUIRED`.
- Atomicity: if D1 insert fails after the R2 put, the R2 object is deleted (no
  orphans); the returned metadata excludes the storage key.

### Primary / reorder / delete

- The **first** uploaded image becomes primary automatically. `.../primary`
  clears all others and sets the chosen one (idempotent; cross-property/owner →
  404).
- **Reorder** requires an exact permutation of the property's image ids (no
  duplicates, no foreign/missing ids) → otherwise **422** `INVALID_IMAGE_ORDER`;
  it assigns `sortOrder` by position.
- **Delete** removes the R2 object (idempotent if already gone) and the D1 row.
  Deleting the primary **promotes** the next remaining image; deleting the last
  leaves no primary.

### Public image behavior

`GET /:propertyId/images/:imageId` streams the bytes **only** when the property
is published and the image belongs to it (else **404** — no existence leak),
with `Content-Type` from the stored MIME and `Cache-Control: public, max-age=3600`.
Published property detail (`GET /api/v1/properties/:id`) now embeds
`images: [{ id, url, isPrimary, sortOrder }]` ordered by `sortOrder` — never the
storage key.

### Local development & testing

The R2 binding `ASSETS` is emulated locally by `wrangler dev` and by an
in-memory R2 shim in tests (`tests/helpers/r2shim.ts`). **No production R2 bucket
was created**, no Cloudflare credentials are required, and deployment is not part
of B5.

---

## Rental requests (B6)

The tenant→landlord request workflow. A request is **not** a rental — B6 never
creates a rental, payment, or notification, and never changes `property.status`.

### Endpoints (base `/api/v1/rental-requests`) — all private (no public route)

| Method & path                 | Auth     | Purpose                                       |
| ----------------------------- | -------- | --------------------------------------------- |
| `POST /`                      | TENANT   | Submit a request (`{ propertyId, message? }`) |
| `GET /mine`                   | TENANT   | List own requests                             |
| `GET /mine/:id`               | TENANT   | View own request                              |
| `PATCH /mine/:id/cancel`      | TENANT   | Cancel own **pending** request                |
| `GET /landlord`               | LANDLORD | List requests for owned properties            |
| `GET /landlord/:id`           | LANDLORD | View a request for an owned property          |
| `PATCH /landlord/:id/approve` | LANDLORD | Approve a **pending** request                 |
| `PATCH /landlord/:id/reject`  | LANDLORD | Reject a **pending** request                  |

Responses use `data.rentalRequest` / `data.rentalRequests`. Tenant identity is
always from the session (never the body); landlord ownership is derived
`session → property.landlord_id → request.property_id`. Cross-owner access
returns a generic **404 RENTAL_REQUEST_NOT_FOUND** (no existence leak).

### State machine

```
PENDING ──approve──▶ ACCEPTED   (terminal)
        ──reject───▶ REJECTED   (terminal)
        ──cancel───▶ CANCELLED  (terminal)
```

Only `PENDING` may transition. Transitions are **atomic conditional updates**
(`UPDATE … WHERE status='PENDING' RETURNING`), so a request can never
double-transition under races. A second transition returns **409**
(`RENTAL_REQUEST_ALREADY_PROCESSED` / `RENTAL_REQUEST_CANNOT_BE_CANCELLED`).
Cancellation sets `CANCELLED` — the row is never deleted (history preserved).

> The `/approve` endpoint sets the request status to **`ACCEPTED`** — the value
> in the B1 status enum (kept as-is rather than renaming to `APPROVED`).

### Creation requirements & duplicate rule

A request may only be created for a property that **exists**, is
**published** (`isPublished = true`), and is **AVAILABLE** — otherwise
**404 PROPERTY_NOT_FOUND**, **409 PROPERTY_NOT_PUBLISHED**, or **409
PROPERTY_NOT_AVAILABLE**. A tenant may hold **at most one active (PENDING or
ACCEPTED) request per property**, enforced by a **partial unique index**
(`rental_requests_active_unique`, migration `0004`); a duplicate returns **409
RENTAL_REQUEST_ALREADY_EXISTS`. After a REJECTED/CANCELLED request the tenant may
submit a new one.

### Approval

Approval verifies ownership + that the request is still PENDING **and** the
property is still published and AVAILABLE, then atomically sets `ACCEPTED`. It
deliberately does **not** create a rental/payment/notification and does not mark
the property OCCUPIED — those belong to later phases.

---

## Rentals (B7)

A tenant converts an **ACCEPTED** rental request into exactly **one ACTIVE
rental**. B7 introduces the first `AVAILABLE → OCCUPIED` property transition and
the rental lifecycle. It creates **no payment, notification, email/SMS**, and
runs no scheduled jobs.

### Endpoints (base `/api/v1/rentals`) — all private (no public route)

| Method & path                         | Auth     | Purpose                                     |
| ------------------------------------- | -------- | ------------------------------------------- |
| `POST /from-request/:rentalRequestId` | TENANT   | Convert an ACCEPTED request → ACTIVE rental |
| `GET /mine`                           | TENANT   | List own rentals                            |
| `GET /mine/:id`                       | TENANT   | View own rental                             |
| `GET /landlord`                       | LANDLORD | List rentals for owned properties           |
| `GET /landlord/:id`                   | LANDLORD | View a rental for an owned property         |
| `PATCH /landlord/:id/complete`        | LANDLORD | End an ACTIVE rental (COMPLETED)            |
| `PATCH /landlord/:id/terminate`       | LANDLORD | End an ACTIVE rental (TERMINATED)           |

Responses use `data.rental` / `data.rentals`. Tenant identity is from the
session; landlord scoping uses `rentals.landlord_id`. Cross-owner access → **404
RENTAL_NOT_FOUND**; wrong role → 403; unauthenticated → 401.

### Conversion flow & derived identity

Convert loads the request **scoped to the tenant** and requires it to be
`ACCEPTED`, not already converted, with the property still **published** and
**AVAILABLE**. The rental derives **everything server-side**: `tenant_id` and
`property_id` from the request, `landlord_id` from the property owner, and
snapshot `monthlyRent`/`securityDeposit`/`currency` from the property. The only
client-provided fields are optional `startDate`/`endDate` (ISO-8601; `start <
end`); a missing body defaults `startDate` to now. Any other field (tenantId,
landlordId, propertyId, monthlyRent, status, id, …) is rejected (**422**).

### Rental state machine

```
(convert)──▶ ACTIVE ──complete──▶ COMPLETED   (terminal)
                    ──terminate─▶ TERMINATED  (terminal)
```

Only `ACTIVE` transitions; transitions are **atomic conditional updates**
(`UPDATE … WHERE status='ACTIVE' RETURNING`). A second transition → **409
RENTAL_NOT_ACTIVE**. History is never deleted.

### Property status

`AVAILABLE → OCCUPIED` happens **only** as part of a successful ACTIVE-rental
creation, and ending a rental sets the property back to `AVAILABLE` — both done
**atomically** (below), so a failed conversion never leaves a property OCCUPIED
and a dangling ACTIVE rental can never exist. Clients still cannot set
`property.status` directly (the B4 property API is unchanged); `isPublished`
remains independent.

### Atomicity, race-safety & consistency (D1 `batch()` + constraints)

The rental write and its coupled property-status change are issued as a single
**D1 `batch()`** — D1's native, all-or-nothing transactional primitive (**not**
an interactive transaction and **not** faked). If either statement fails the
whole batch rolls back, so the invariant **"an ACTIVE rental ⇔ its property is
OCCUPIED"** always holds:

- **Create:** `INSERT ACTIVE rental` + `UPDATE property → OCCUPIED` in one batch;
  a failing property update rolls back the insert (no dangling rental).
- **End:** `UPDATE rental → COMPLETED/TERMINATED (if ACTIVE)` + `UPDATE property
→ AVAILABLE (if OCCUPIED)` in one batch.

Uniqueness is still enforced by DB constraints (never weakened):

- `rentals.rental_request_id` **UNIQUE** → a request produces **at most one**
  rental (and is the "already-converted" marker) → duplicate convert **409
  RENTAL_ALREADY_EXISTS**.
- partial unique index `rentals_one_active_per_property` on `(property_id) WHERE
status='ACTIVE'` → **at most one ACTIVE rental per property**; a second
  concurrent conversion → **409 PROPERTY_NOT_AVAILABLE**.

The rental row remains the authoritative source of truth; `property.status` is a
consistent denormalized reflection of it.

---

## Payment infrastructure (B8)

Provider-**independent** payment layer. **B8 moves no money** and calls **no
provider** — it creates a `PENDING` payment **intent** tied to a specific rental.
MTN MoMo / Airtel Money integrations, webhooks/callbacks, and reconciliation jobs
are later phases.

### Endpoints (base `/api/v1/payments`) — all private

| Method & path       | Auth     | Purpose                                      |
| ------------------- | -------- | -------------------------------------------- |
| `POST /`            | TENANT   | Create a PENDING payment intent (idempotent) |
| `GET /mine`         | TENANT   | Own payment history                          |
| `GET /mine/:id`     | TENANT   | Own payment detail                           |
| `GET /landlord`     | LANDLORD | Payments for owned properties                |
| `GET /landlord/:id` | LANDLORD | Payment detail for an owned property         |

There is intentionally **no status-mutation endpoint** — a client can never mark
a payment `SUCCESSFUL`. Responses use `data.payment` / `data.payments`.

### Payment ⇄ rental relationship

Every payment **belongs to a specific rental** (`rentalId`). The tenant supplies
only `{ rentalId, amount, paymentPeriod, provider }`; the server **derives**
`tenantId`, `landlordId`, `propertyId`, and `currency` from the rental (never
trusted from the client). Only the tenant who owns an **ACTIVE** rental may pay
it — otherwise **404 RENTAL_NOT_FOUND** (cross-tenant) or **409
RENTAL_NOT_PAYABLE** (COMPLETED/TERMINATED).

### Money, period, amount policy

Money is **INTEGER whole RWF** (currency from the rental, default `RWF`; client
cannot switch it). `paymentPeriod` is canonical **`YYYY-MM`** (validated).
**Amount policy (MVP):** a positive integer **≤ the rental's monthly rent** —
partial payments are allowed, overpayment is rejected (**422
PAYMENT_INVALID_AMOUNT**). The model is extensible for future adjustments.

### Payment status machine

```
PENDING ──▶ SUCCESSFUL   (terminal)
        ──▶ FAILED       (terminal)
        ──▶ CANCELLED    (terminal)
        ──▶ EXPIRED      (terminal)
```

A new intent starts **PENDING** — B8 never marks it SUCCESSFUL. Transitions are
exposed **only** through an internal, provider-neutral service method (used by
future provider integrations/tests), via an **atomic conditional update**
(`WHERE status='PENDING'`). Terminal states are final; repeating the _same_
terminal status is an idempotent no-op; `completedAt` is set only for SUCCESSFUL.

### Idempotency

Payment creation **requires** an **`Idempotency-Key`** header (8–255 chars). The
key is unique **per tenant** (partial unique index `payments_tenant_idempotency_
unique` on `(tenant_id, idempotency_key)`, migration `0006`). Retries with the
same key + same parameters return the **same** payment (`200`); the same key with
**different** parameters → **409 IDEMPOTENCY_KEY_REUSED**; concurrent duplicates
are protected by the DB unique index (only one payment persists). The key is
never returned in responses or logged.

### Provider abstraction

`src/types/payment.ts` defines provider-neutral contracts (`PaymentProviderName`,
`PaymentStatus`, `PaymentProviderResult`, `PaymentProvider`) so the app depends
only on interfaces. **No concrete provider, credentials, URLs, or network calls
exist in B8** — MTN (B10) and Airtel (B11) implement `PaymentProvider` later.

---

## Payment provider preparation & webhook architecture (B9)

A **provider-neutral** callback pipeline that prepares for MTN (B10) / Airtel
(B11) **without implementing either**. B9 makes no provider network calls and
adds no credentials, URLs, or signature algorithms.

### Endpoint

```
POST /api/v1/payment-webhooks/:provider     (provider ∈ MTN_MOMO | AIRTEL_MONEY)
```

**Public — no user session** (a webhook is authenticated by _provider
verification_, not a cookie). The raw request body is preserved so a future
adapter can verify a signature over the exact bytes. A verified, parseable event
returns a generic `{ "received": true }` (200); it never returns internal
payment details.

### Pipeline (strictly ordered — payment state is never touched before auth)

```
verify (auth) → normalize → validate → dedup → persist (RECEIVED)
   → correlate → verify amount/currency → apply B8 transition → mark outcome
```

- **Provider adapter registry** (`getWebhookAdapter`): empty in B9, so both
  providers currently return **501 WEBHOOK_PROVIDER_NOT_IMPLEMENTED**. B10/B11
  register real `PaymentWebhookAdapter`s (`verify` + `normalize`). An unsupported
  `:provider` → **400 WEBHOOK_UNSUPPORTED_PROVIDER**.
- **Authentication:** `adapter.verify(rawBody, headers, url)` must pass first; a
  failure → **401 WEBHOOK_VERIFICATION_FAILED** and the event is **not persisted**
  (avoids a DB-flooding vector). Signature verification is separate from
  processing.
- **Normalize:** the adapter maps the opaque payload → a `NormalizedWebhookEvent`
  (status already mapped to our internal vocabulary). Malformed → **400
  WEBHOOK_INVALID_EVENT**.

### Event persistence, dedup & lifecycle

Events are stored in a dedicated **`payment_provider_events`** table (migration
`0007`) — **not** the payments table. Processing lifecycle: `RECEIVED →
PROCESSED | UNMATCHED | FAILED`. We store **no raw payloads** (only normalized,
non-sensitive metadata + a SHA-256 `payload_hash` fingerprint). Deduplication is
DB-enforced: unique `(provider, payload_hash)` (a re-delivered payload) **and**
partial-unique `(provider, external_event_id)` (a stable event id) — so duplicate
deliveries are idempotently acknowledged, never reprocessed.

### Correlation & verification

Events correlate to a payment **only** by `(provider, provider_transaction_id)` —
never by amount/phone/name. An event with no match is persisted **UNMATCHED**
(never discarded, never fabricates a payment) for later reconciliation. Before
applying success, the event's **amount/currency are compared** to the payment;
a mismatch is recorded **FAILED** (`PAYMENT_AMOUNT_MISMATCH` /
`PAYMENT_CURRENCY_MISMATCH`) and the payment is left unchanged.

### Payment transition (single authoritative mechanism)

Webhook processing calls the **B8** `applyProviderStatus` — there is exactly one
internal payment state machine. Terminal states stay final: a verified event
conflicting with an already-terminal payment is recorded **FAILED
(PAYMENT_PROVIDER_STATUS_CONFLICT)** and never silently overwrites the payment. A
repeated same-status event is an idempotent no-op.

### Response policy (documented)

Verification/format failures → 4xx (`401`/`400`/`501`). Any **authenticated,
parseable** event (processed / duplicate / unmatched / conflict / mismatch) →
**200** so the provider stops retrying, while the persisted row records the true
outcome for reconciliation.

### Security & deferral

No raw bodies, signatures, secrets, or idempotency keys are logged. **No MTN or
Airtel implementation, credentials, URLs, OAuth, or signature algorithms** exist
in B9 — those are B10/B11. No notifications, no scheduled reconciliation jobs, no
production webhook registration, no deployment.

---

## MTN MoMo integration (B10)

MTN MoMo is plugged into the provider-neutral B8/B9 architecture — **no second
payment state machine and no second webhook pipeline**. It reuses the B8
`PaymentProvider` contract, the B9 `PaymentWebhookAdapter` + registry, and the
single authoritative `applyProviderStatus` transition.

### Official sources consulted

- MTN MoMo Developer Portal — <https://momodeveloper.mtn.com/api-documentation/api-description/>
- Target-Environment for production — <https://momodevelopercommunity.mtn.com/how-to-59/target-environment-for-production-100>
- MoMo API production configuration — <https://momodevelopercommunity.mtn.com/how-to-59/momo-api-production-configuration-101>
- Collection API / Request-to-Pay reference (endpoints, headers, status values); sandbox/going-live guidance _(supplementary)_

Verified: sandbox base `https://sandbox.momodeveloper.mtn.com`; OAuth token
`POST /collection/token/` (Basic `apiUser:apiKey` + `Ocp-Apim-Subscription-Key`);
`POST /collection/v1_0/requesttopay` (headers `X-Reference-Id`,
`X-Target-Environment`, `Authorization: Bearer`, `Ocp-Apim-Subscription-Key`;
→ **202 Accepted**, no body); status `GET /collection/v1_0/requesttopay/{id}`
→ `status: PENDING | SUCCESSFUL | FAILED` + `financialTransactionId`.

**Target environment.** Sandbox uses `X-Target-Environment: sandbox`. **MTN
production uses a COUNTRY identifier, NOT the literal `production`** — for
**Rwanda production the value is `mtnrwanda`** (same scheme as `mtnuganda`,
`mtnghana`, …). Configure this via `MTN_MOMO_TARGET_ENVIRONMENT`.

**Callbacks are NOT cryptographically signed by MTN.** Our
`MTN_MOMO_CALLBACK_TOKEN` check is an **application-level** defense (a shared
secret we embed in the callback URL we register with MTN), _not_ an MTN-native
signature. The authoritative confirmation seam remains `checkStatus` (status
re-lookup), preserved for later reconciliation. HTTPS is required for the
production callback host.

**Sandbox currency caveat:** MTN sandbox request-to-pay accepts only `EUR`;
Rwanda **production uses `RWF`**. The integration sends the payment's currency
(`RWF`), which is correct for production — sandbox smoke-testing with real
credentials would need `EUR`.

### Configuration (secrets — see `.dev.vars.example`)

`MTN_MOMO_BASE_URL`, `MTN_MOMO_SUBSCRIPTION_KEY`, `MTN_MOMO_API_USER`,
`MTN_MOMO_API_KEY`, `MTN_MOMO_TARGET_ENVIRONMENT` (`sandbox` in dev; `mtnrwanda`
for Rwanda production), `MTN_MOMO_CALLBACK_TOKEN` (application-level webhook
secret), optional `MTN_MOMO_CALLBACK_URL`. MTN is **inactive** unless the four
core values are present (the app then behaves exactly as B8/B9). **Fail-safe:** a
non-production `ENVIRONMENT` may target **only** `sandbox`; any other value
(`mtnrwanda`, `production`, …) is refused (`MTN_UNSAFE_ENVIRONMENT`) so a dev
build can never reach a live target.

### Flow

`POST /api/v1/payments` with `provider: MTN_MOMO` → B8 creates/replays the
`PENDING` payment → the service assigns a **stable per-payment reference**
(stored as `providerTransactionId`, used as MTN's `X-Reference-Id`) and calls
Request-to-Pay with the **authenticated tenant's stored phone** (never a
client value; `+2507…` → MSISDN `2507…`). A `202` (or `409` duplicate) keeps the
payment **PENDING** — B10 never marks a payment SUCCESSFUL on initiation.

- **Payer phone:** always the session tenant's stored number. A client-supplied
  `payerPhone`/`msisdn` is rejected (422, strict schema).
- **Reference / correlation:** `X-Reference-Id = externalId = providerTransactionId`.
  MTN's callback echoes `externalId`, which B9 correlates by
  `(provider, providerTransactionId)`. MTN's `financialTransactionId` becomes the
  webhook event id (dedup).
- **Status mapping:** MTN `SUCCESSFUL→SUCCESSFUL`, `FAILED→FAILED`,
  `PENDING→PENDING` (never invented). Callbacks must be terminal.

### Idempotency, retries & timeouts

The `Idempotency-Key` (B8) yields one internal payment; the **stable reference**
means a retry re-uses the same `X-Reference-Id`, so MTN dedupes (409) — **no
double charge**. Outbound MTN calls are bounded by a **10s AbortController
timeout**; failures never retry blindly. Errors are mapped to safe codes
(`PAYMENT_PROVIDER_ERROR` 502, `PAYMENT_PROVIDER_TIMEOUT` 504) — raw MTN
responses, tokens, and credentials are never surfaced or logged.

### Webhook

The generic B9 route `POST /api/v1/payment-webhooks/MTN_MOMO` is used. The MTN
adapter authenticates via the **shared `MTN_MOMO_CALLBACK_TOKEN`** (in the
callback URL/`Authorization` — MTN callbacks are unsigned), then normalizes the
payload; B9 deduplicates, correlates, verifies amount/currency, and applies the
transition. Duplicate/unknown/mismatch/terminal-conflict callbacks are handled
by B9 (idempotent; terminal payments are never overwritten).

### Testing & live status

The automated suite (`tests/mtn-momo.test.ts`) exercises the **real** app path
with `fetch` stubbed to simulate MTN — no real account/credentials/network.
**MTN sandbox live verification: NOT AVAILABLE — credentials not configured.**
No provider secrets are committed; no production resources were created; nothing
was deployed. **Airtel Money = B11; notifications = B12.**

---

## Notifications (B12)

**In-app only** (D1-backed). Notifications are a secondary, user-facing delivery
record — never the source of truth for a business event. **No email/SMS/push/
WhatsApp**, and **no scheduled reminders** (cron/queue/scheduled Workers) — the
`RENT_REMINDER` type + helper are prepared but never auto-generated in B12.

### Endpoints (base `/api/v1/notifications`) — all require auth (both roles)

| Method & path     | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `GET /`           | List own notifications (paginated, filterable) |
| `GET /:id`        | Own notification detail                        |
| `PATCH /:id/read` | Mark one read (idempotent)                     |
| `PATCH /read-all` | Mark all own unread read (idempotent)          |

Ownership is always the session user; a client `userId` in the query is ignored
(stripped). Cross-user access → **404 NOTIFICATION_NOT_FOUND**. There is no
`/:userId` route and no admin. Response wraps `data.notification(s)` and, for the
list, `{ pagination: { page, limit, total, totalPages }, unreadCount }`.

Listing: `?page` (≥1, default 1), `?limit` (1–100, default 20), `?unread=true|false`,
`?type=<NOTIFICATION_TYPE>`; newest first. Invalid type/pagination → **422**.

### Notification types

Rental requests: `RENTAL_REQUEST_SUBMITTED`, `NEW_RENTAL_REQUEST`,
`RENTAL_REQUEST_ACCEPTED`, `RENTAL_REQUEST_REJECTED`, `RENTAL_REQUEST_CANCELLED`.
Rentals: `RENTAL_ACTIVATED`, `RENTAL_COMPLETED`, `RENTAL_TERMINATED`.
Payments: `PAYMENT_INITIATED`, `PAYMENT_SUCCESSFUL`, `PAYMENT_RECEIVED`,
`PAYMENT_FAILED`. Plus `RENT_REMINDER` (prepared, not auto-sent). A notification
may link a related entity (`PROPERTY | RENTAL_REQUEST | RENTAL | PAYMENT` + id).

### Business-event integration

Notifications are created **after** the authoritative state transition succeeds:

- B6 rental requests: submit (tenant + landlord), accept/reject (tenant), cancel (landlord).
- B7 rentals: activation, completion, termination (tenant + landlord).
- B8 payments: intent created → `PAYMENT_INITIATED`; via the single
  `applyProviderStatus` seam, `PENDING → SUCCESSFUL` → tenant + landlord, and
  `PENDING → FAILED` → both. Provider adapters (MTN/future Airtel) never create
  notifications directly — they flow through this shared path.

### Idempotency & failure isolation

Each event notification carries a deterministic `event_key` (e.g.
`pay_success:<paymentId>`); a **partial unique index on `(user_id, event_key)`**
(migration `0008`) guarantees **one notification per recipient per event** — a
retried action or duplicate provider webhook never duplicates a notification,
while distinct events (distinct keys) still create separate ones. Creation is
**failure-isolated**: a notification error is logged and swallowed and can NEVER
roll back or corrupt the authoritative rental/payment/property state.

---

## Security & Compliance (B13)

B13 is a cross-cutting security, privacy, and compliance **foundation** — an
audit plus minimal hardening, not new features. It does **not** replace advice
from qualified Rwandan legal/compliance professionals.

### Threat model (summary)

```
External attacker → Public API → AuthN → AuthZ → Properties → Rental requests
→ Rentals → Payments → Mobile-money providers → Webhook callbacks → Notifications
```

The most material threats and their existing mitigations:

| Threat                       | Mitigation                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| Credential stuffing / brute  | PBKDF2 verification + login rate limit; generic `AUTH_INVALID_CREDENTIALS` |
| User enumeration (timing)    | Dummy-hash verify on unknown email; generic forgot-password response       |
| Session theft                | HttpOnly + Secure (prod) cookie; only the token **hash** is stored in D1   |
| IDOR / privilege escalation  | Every query scoped by session identity; `requireRole`; generic 404s        |
| Mass assignment              | `.strict()` Zod schemas + explicit allow-listed update objects             |
| Duplicate / replay payments  | `Idempotency-Key` + partial-unique indexes; single authoritative FSM       |
| Forged / replayed webhooks   | Adapter `verify()` before any state change; payload-hash dedup; 401 forged |
| Malicious uploads            | Magic-byte sniffing (no SVG), 5 MB cap, server-generated R2 keys           |
| Secret / PII leakage in logs | Structured logger redacts sensitive keys; no header/body/payload logging   |
| Injection (SQL)              | Drizzle parameterized queries only; no user-controlled SQL identifiers     |

### Security controls

- **Authentication** — server-side D1 sessions; 32-byte random token, stored
  **hashed** (SHA-256), never in plaintext; 7-day expiry; revocable. Login and
  registration issue fresh server-generated tokens (no session fixation).
- **Password hashing** — PBKDF2-HMAC-SHA-256, 100,000 iterations, 16-byte random
  salt, 256-bit derived key, self-describing format (`pbkdf2$sha256$…`),
  constant-time comparison. Iteration count is a deliberate balance for the
  Workers CPU budget; the format lets it evolve without breaking stored hashes.
- **Session invalidation** — **all** sessions are revoked on password change and
  password reset; a fresh session replaces them for the current request.
- **Authorization / IDOR** — identity always comes from the session, never the
  client. Resources are fetched with owner-scoped queries
  (`findByIdForTenant`, `findByIdForLandlord`, `…ForUser`); cross-owner access
  returns a generic **404** (no existence disclosure). `requireRole` gates
  tenant/landlord routes. **No admin role.**
- **Input validation** — Zod on body/query/params; `.strict()` on state-changing
  bodies (rejects unknown/server-controlled keys); bounded string lengths,
  numeric ranges, enums, `YYYY-MM` periods, and pagination (`limit ≤ 100`).
- **CORS** — exact-match single origin from `FRONTEND_URL` (never `*`, never a
  reflected Origin); `credentials: true`; allowed request headers include
  `Idempotency-Key` (required for cross-origin payment idempotency). A
  disallowed origin receives **no** `Access-Control-Allow-Origin`.
- **Security headers** — Hono `secureHeaders()` (nosniff, `X-Frame-Options`,
  referrer policy, HSTS, etc.). Content-Security-Policy is intentionally omitted
  here — it belongs on the frontend that renders HTML; this API returns JSON and
  raw image bytes only.
- **Cookies** — `HttpOnly`; `Secure` in production (and whenever `SameSite=None`);
  `SameSite=Lax` by default (set `SESSION_SAMESITE=None` for a cross-site
  frontend, which forces `Secure`); `Path=/`; explicit `Max-Age`.
- **Rate limiting** — application-level fixed-window foundation on
  register/login/forgot-password and **payment creation**. It is **per-isolate**
  (not globally distributed) and is a lightweight guard only — production must
  also enforce **Cloudflare Rate Limiting / WAF** at the edge. Webhook endpoints
  are intentionally **not** app-rate-limited (that would drop legitimate provider
  retries); use edge controls there.
- **File / R2 security** — landlord-only upload; type decided by **magic bytes**
  (JPEG/PNG/WebP; SVG blocked); 5 MB per image, 20 per property; R2 object keys
  are always server-generated (`properties/<propertyId>/<imageId>/<sanitized>`),
  so path traversal and arbitrary key selection are impossible; storage keys are
  never exposed; public bytes are served only for **published** properties.
- **Payment / webhook security** — money is integer RWF; a payment is bound to
  the tenant's own ACTIVE rental; there is **no** client-facing status-mutation
  endpoint; provider transaction ids and success can never be client-injected;
  webhooks are verified before any state change, correlated by
  `(provider, providerTransactionId)` only, re-checked for amount/currency, and
  applied through the single authoritative state machine; terminal states are
  never overwritten. See **MTN MoMo integration (B10)** for the callback-token
  caveat (application-level auth; MTN callbacks are **not** natively signed).
- **Logging / redaction** — structured JSON logs; a redaction pass masks
  sensitive keys (password, token, authorization, cookie, secret, api key,
  access token). The request logger records method/path/status/duration only —
  never headers or bodies. Raw provider payloads and notification objects are
  never logged.
- **Secret management** — no secrets in source, examples, migrations, tests, or
  README (names only). Secrets load from `.dev.vars` locally (git-ignored) and
  `wrangler secret put` for deployed environments. `.gitignore` covers
  `.dev.vars`, `.env*`.
- **Error disclosure** — centralized handler returns the safe envelope; stack
  traces and raw messages are shown only outside production.

### Privacy & data minimization

- **Personal-data categories stored:** name, email, phone (users); property
  location (province→village); rental relationships; payment metadata (amount,
  period, provider, provider transaction id); provider webhook events; in-app
  notification messages. **No** national ID, passport, bank/card numbers, or
  demographic data is collected. Passwords are stored only as PBKDF2 hashes.
- **Minimization:** notifications and payment messages contain only the minimum
  needed (amount, period, property title, provider) — never secrets or tokens.
  Payer phone is derived server-side from the rental, not re-collected.
- **Hosting:** the app runs on Cloudflare Workers with D1 and R2. Where those
  data stores are physically located, and whether that satisfies the Rwandan
  data-localisation rule below, is a **legal/compliance question** (see next).

### Rwanda compliance foundation

Verified against the current official text of **Law N° 058/2021 of 13/10/2021
relating to the protection of personal data and privacy** (via RwandaLII) and
the National Cyber Security Authority (NCSA) / Data Protection & Privacy Office
(DPO). This is a **technical** foundation; a qualified Rwandan
legal/compliance review is still required before production.

**VERIFIED REQUIREMENTS (official sources):**

- **Registration (Arts. 29–31):** a data controller/processor **must register**
  with the supervisory authority (NCSA/DPO); a certificate is issued within 30
  working days. → **Operational/legal action** for the platform operator.
- **Security safeguards (Art. 47; Art. 11 for sensitive data):** appropriate,
  reasonable, regularly-updated technical measures. → Addressed technically by
  the controls above (hashing, least-privilege, transport security, redaction).
- **Breach notification (Arts. 43–45):** notify the supervisory authority within
  **48 hours** of awareness; a fuller report within **72 hours**; notify affected
  data subjects when there is high risk. → See incident-response checklist below.
- **Data-subject rights (Arts. 18–24):** access, rectification, erasure,
  objection, portability — controller response generally within **30 days**.
- **Data localisation (Art. 50) & cross-border transfer (Art. 48):** personal
  data is stored **in Rwanda** unless the controller holds a certificate
  authorising offshore storage / an authorised transfer basis.

**LEGAL / COMPLIANCE REVIEW REQUIRED (do not assume; verify with counsel):**

- Whether/when this specific platform must complete NCSA/DPO registration and
  designate a data protection officer or local representative.
- Whether Cloudflare's Workers/D1/R2 data locations satisfy Art. 50 localisation,
  or whether an offshore-storage certificate / DPA with Cloudflare is required.
- Applicability of financial/payment (mobile-money) regulatory obligations to a
  rental-payment platform.
- Exact scope of records-of-processing and consent/notice wording.

**Data-subject-rights readiness:** _access_ and _rectification_ are partially
supported today (`GET/PATCH /users/me`); _erasure_, _objection_, and
_portability_ have **no** dedicated API yet — historical rentals/payments are
retained for reconciliation, so erasure needs a legally-reviewed policy. These
belong in a future, deliberately-scoped compliance phase (not B13).

### Incident-response checklist (technical foundation)

1. **Detect** — watch structured logs (`auth.*`, `payment.status_changed`,
   `webhook.*`, `WEBHOOK_VERIFICATION_FAILED`, rate-limit `429`) via
   `wrangler tail` / Cloudflare observability.
2. **Contain** — revoke affected sessions; rotate the relevant secret
   (`wrangler secret put`); tighten edge/WAF rules.
3. **Investigate** — reconstruct from `payment_provider_events` and request logs
   (which contain no secrets).
4. **Preserve evidence** — snapshot logs and relevant D1 rows.
5. **Assess impact** — identify data categories and subjects affected.
6. **Notify** — where legally required, the supervisory authority within the
   statutory window (48h notify / 72h report, Arts. 43–44) and affected subjects
   on high risk (Art. 45). Confirm current obligations with counsel.
7. **Recover** — restore from backups; re-verify integrity.
8. **Document** — record timeline, root cause, and remediations.

### Backup / recovery (requirements, not yet provisioned)

A local `wrangler dev` D1 file is **not** a backup. For production, establish and
test: D1 backups/export + point-in-time recovery, migration history in VCS, R2
object versioning/recovery, secret re-provisioning runbook, and periodic
restore drills. These are deployment-time operational tasks.

### Remaining production security risks

- Application rate limiting is per-isolate — **edge/WAF rate limiting is
  required** in production.
- MTN callbacks are not natively signed; the callback token is an
  application-level defense (residual risk documented in B10).
- Dependency advisories remain in **dev/build tooling** (see below); a
  `wrangler@4` migration is needed to clear them and is deferred as a deliberate
  major upgrade.
- Legal/compliance items above require external action before go-live.

### Dependency audit (npm audit)

All current advisories are in **development/build/test tooling**
(`wrangler`→`miniflare`→`undici`/`ws`, `esbuild`, `vitest`/`vite`, `drizzle-kit`,
`sharp`) — none ship in the Cloudflare Workers production bundle. Clearing them
requires the breaking `wrangler@4` upgrade, deliberately deferred (do not
`npm audit fix --force`). The one advisory touching a **runtime** dependency,
`drizzle-orm < 0.45.2` (SQL injection via user-controlled SQL **identifiers**),
is **not exploitable here** — this codebase passes no user-controlled identifiers
to Drizzle (all identifiers are static schema references; all values are
parameterized). A trial upgrade to `0.45.2` typechecked but **failed a
regression test** (changed FK-violation error text broke `RESTRICT`
detection), so it is **not a safe drop-in**; the upgrade is deferred to a
dedicated dependency task with coordinated `drizzle-kit` bump and full
re-validation.

### Production security checklist

Technical checks pass in code; items needing external operational/legal action
are marked **(action required)** and must **not** be considered done here.

- [ ] Production secrets configured via `wrangler secret put` (action required)
- [ ] Sandbox vs production credentials separated (action required)
- [x] MTN Rwanda production target verified (`mtnrwanda`, fail-safe enforced)
- [x] Airtel remains disabled until the official contract is verified
- [ ] CORS `FRONTEND_URL` set to the production origin (action required)
- [x] HTTPS-only cookies in production (`Secure` enforced)
- [x] Secure cookies enabled (HttpOnly, SameSite, Path, Max-Age)
- [x] Application rate limits present; **edge/WAF limits** (action required)
- [x] Logging redaction verified (tests assert no secrets/tokens in logs)
- [x] Payment / webhook protections verified (tests)
- [ ] D1 backup strategy established & restore-tested (action required)
- [ ] R2 recovery strategy established (action required)
- [ ] Monitoring/alerting configured (action required)
- [ ] Incident-response process operational (checklist above; action required)
- [ ] Compliance/legal review completed (action required)
- [ ] Data-protection obligations verified with counsel (action required)
- [ ] Production smoke tests completed (action required)
- [x] Dependency vulnerabilities reviewed & classified (see above)

**Official sources consulted:** Law N° 058/2021 (RwandaLII:
`rwandalii.org/akn/rw/act/law/2021/58`); NCSA (`cyber.gov.rw`); Data Protection
& Privacy Office (`dpo.gov.rw`). Legal claims here are limited to what those
sources state; anything unverifiable is marked **LEGAL/COMPLIANCE REVIEW
REQUIRED**.

---

## Public Property Discovery API (B17)

`GET /api/v1/properties` — **public** (no auth; usable by visitors, tenants, and
landlords) discovery of **published** properties. It closes the gap the F2
frontend identified (previously only property _detail_ was public).

**Publication rule:** the query **always** enforces `is_published = true` in the
database. An unpublished property never appears — even if `status=AVAILABLE`,
its id is known, or a filter matches. `isPublished` (discoverability) stays
orthogonal to `status` (availability); the list returns the real persisted
status and never lets the client change it.

**Query parameters** (strict — unknown params → `422`):

| Param                                                         | Notes                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `page`                                                        | integer ≥ 1 (default 1)                                                     |
| `limit`                                                       | integer 1–100 (default 12)                                                  |
| `province` / `district` / `sector` / `cell` / `villageOrArea` | exact match                                                                 |
| `propertyType`                                                | `APARTMENT` \| `HOUSE` \| `ROOM` \| `STUDIO` \| `OTHER`                     |
| `status`                                                      | `AVAILABLE` \| `OCCUPIED` \| `UNAVAILABLE` (published-only still enforced)  |
| `minRent` / `maxRent`                                         | integer whole RWF, ≥ 0, `minRent ≤ maxRent`                                 |
| `bedrooms` / `bathrooms`                                      | integer, exact match                                                        |
| `q`                                                           | safe parameterized substring over title/description/district/sector/village |
| `sort`                                                        | `newest` (default) \| `rent_asc` \| `rent_desc`                             |

Pagination is done in the database (`LIMIT`/`OFFSET` + a `COUNT(*)`), never in
memory. Sorting uses a fixed allow-list — **no** user SQL in `ORDER BY`. `q`
uses parameterized `LIKE` (values bound, wildcards escaped) — **no** FTS,
external search, or dynamic identifiers. Advanced **amenities** filtering is
deferred (documented) to avoid fragile JSON SQL.

**Response** (existing envelope): `{ success, data: { properties: [...], pagination } }`
where each item is a listing-safe **card** — the same flat fields as the public
detail serializer (minus the full `description`), with `landlord` reduced to
`{ id, firstName, lastName }` and `images` carrying the **primary image only**
(safe public URL, never an R2 object key). Landlord + primary-image data are
**batch-hydrated** (no N+1). An empty result is `200` with `properties: []`
(never `404`).

Example:

```bash
curl "http://localhost:4000/api/v1/properties?district=Gasabo&propertyType=APARTMENT&minRent=100000&maxRent=500000&page=1&limit=12&sort=rent_asc"
```

**Index:** migration `0009` adds `properties_public_sort_idx (is_published,
published_at)` to serve the exact filter+sort path. **B11 Airtel remains
deferred.** The full contract is in [`openapi.json`](openapi.json)
(`listPublicProperties`).

### F2 frontend compatibility

The response item is field-compatible with the F2 `PropertyCard` /
`PropertyGrid` contract (`frontend/components/properties/*`): flat
`id/title/propertyType/monthlyRent/securityDeposit/otherCharges/currency/bedrooms/bathrooms/`
`province/district/sector/cell/village/additionalLocation/amenities/status`, plus
`landlord{id,firstName,lastName}` and `images[]`. **No frontend changes were made
in B17**; wiring `frontend/app/properties/page.tsx` to fetch this endpoint (it
currently shows an "unavailable" state) is a future frontend task.

## API Documentation (B15)

The complete, machine-readable API contract lives in
**[`openapi.json`](openapi.json)** (OpenAPI **3.1.0**) — the canonical source,
hand-authored from and validated against the actual source code. It documents
all **49** endpoints across 10 tags with request/response schemas, error
schemas, examples, security, and pagination.

```bash
npm run docs:validate   # validate the spec + detect route drift + scan for secrets
```

`docs:validate` (a dependency-free Node script) checks that the document is
structurally valid OpenAPI 3.1, that every `$ref` resolves, that the documented
route set **exactly matches** the routes in `src/routes/v1/*` (no missing or
fictional routes), and that no secrets appear in the spec. The same checks run
in the test suite (`tests/openapi.test.ts`), so documentation cannot silently
drift from the implementation.

### API overview

- **Base URL (local):** `http://localhost:4000`; all resources are versioned
  under **`/api/v1`**.
- **Authentication:** a server-side session cookie **`rrp_session`** (HttpOnly;
  Secure in production; SameSite=Lax by default). **No Bearer/JWT.** Browser
  clients must send credentials. The raw token is never in a response body.
- **Roles:** `LANDLORD` and `TENANT` only — no admin role. Cross-owner access
  returns **404** (never revealing existence).
- **Envelopes:** success `{ "success": true, "data": { … } }`; error
  `{ "success": false, "error": { "message", "code", "details?" } }` with stable
  machine-readable codes (e.g. `AUTH_INVALID_CREDENTIALS`, `PROPERTY_NOT_FOUND`,
  `IDEMPOTENCY_KEY_REUSED`, `NOTIFICATION_NOT_FOUND`, `WEBHOOK_VERIFICATION_FAILED`).
- **Money:** integer whole RWF (no floats); no latitude/longitude.

### Resource groups (tags)

Health · Authentication · Users · Properties · Property Images · Rental Requests
· Rentals · Payments · Payment Webhooks · Notifications.

### Payment idempotency

`POST /api/v1/payments` requires an **`Idempotency-Key`** header (8–255 chars).
Same key + same parameters → idempotent replay (`200`); same key + different
parameters → `409 IDEMPOTENCY_KEY_REUSED`. A new intent returns `201`.

### Webhooks

`POST /api/v1/payment-webhooks/{provider}` is **public** and NOT
session-authenticated — each provider adapter authenticates the delivery itself.
For **MTN_MOMO** this is an **application-level shared secret** (bearer token or
`?token=` in the registered callback URL); MTN callbacks are not cryptographically
signed, so this is not an MTN-native signature. Verified-but-unmatched/duplicate/
conflicting events still return `200`; verification/format failures return `4xx`.

### Provider status

- **MTN MoMo:** implemented. **Live sandbox verification is still pending —
  credentials are not configured.**
- **Airtel Money (B11): DEFERRED.** `AIRTEL_MONEY` is a declared enum value only;
  a payment with it yields a plain PENDING intent, and its webhook returns `501`.
  The spec documents no fictional Airtel endpoint, headers, OAuth, or statuses.

### Public image bytes

`GET /api/v1/properties/{propertyId}/images/{imageId}` returns **raw image
bytes** (`image/jpeg` · `image/png` · `image/webp`), not JSON, for published
properties only.

> **API documentation complete is not production go-live.** B15 delivers the
> contract; production preparation/deployment remains B16 and the external
> actions in the B13 checklist.

---

## Backend QA & Testing (B14)

B14 is a quality-assurance and hardening phase — no new product functionality.
It establishes that the backend reliably performs the complete MVP business
journeys without violating the security/business invariants of B0–B13.

### Commands

```bash
npm test              # full suite (Vitest, run once)
npm run test:coverage # full suite + V8 coverage report (text + json-summary)
npm run test:watch    # watch mode
npm run typecheck && npm run lint && npm run format:check && npm run build
```

### Test architecture

- **Real HTTP path, not mocks.** Tests call `app.request(path, init, env)` against
  the actual Hono app, exercising route → middleware → validator → controller →
  service → repository → Drizzle → D1.
- **Local D1 strategy.** `tests/helpers/testDb.ts` builds a fresh in-memory
  SQLite (Node's built-in `node:sqlite`) and applies the **actual migration
  chain** `0000 → 0008` with `PRAGMA foreign_keys = ON`, so every test runs
  against the real schema (CHECK/FK/unique/partial-unique). Each test constructs
  its own `makeTestEnv()`, so there is **no cross-test data leakage**.
- **R2 strategy.** `tests/helpers/r2shim.ts` is an in-memory R2 bucket
  (`put/get/delete/head` + `keys()` introspection); a fresh instance per test.
- **Provider mocks.** MTN outbound calls are stubbed via `vi.stubGlobal('fetch')`;
  webhook adapters use a **test-only** adapter registered at runtime into the
  (otherwise empty) provider registry, so no test code ships in production.

### Coverage

V8 coverage over `src/**` (excluding the Worker entry wrapper and pure type
files): **≈95% statements, ≈86% branches, ≈93% functions**. Critical
security/business modules are at or near 100% (controllers, repositories,
routes, config, crypto, error handler, rate limiter). The remaining uncovered
lines are **deliberately defensive branches** documented as such:

- `middleware/auth.ts` — the "valid session, user deleted mid-request" guard
  (sessions cascade-delete with the user, so this is only reachable in a race)
  and the `getAuthUser()` "called without `requireAuth`" programming-error guard.
- `errorHandler.ts` / `rateLimit.ts` — dev-only diagnostic sub-branches and the
  `cf-connecting-ip → x-forwarded-for → 'unknown'` fallback chain.

### Test suites (15 files, 251 tests)

Health/404/errors, DB schema + **migration reproducibility**, auth, users,
properties, property images/R2, rental requests, rentals (+ D1 batch
atomicity + conversion race), payments (+ idempotency race), payment webhooks,
MTN provider, notifications, **B13 security regression** (30), and **B14 QA
hardening** (error disclosure, rate-limit enforcement, password-verify guards,
phone normalization, deleted-user auth edge, consolidated end-to-end journey).

### End-to-end journey (automated)

`tests/qa-hardening.test.ts` runs the full MVP flow through the real app:
landlord registers → creates property → uploads image → publishes → tenant
registers → requests → landlord accepts → tenant converts to an **ACTIVE**
rental (property becomes **OCCUPIED**) → tenant creates a **PENDING** payment →
a verified provider webhook marks it **SUCCESSFUL** → both parties hold the
expected notifications. Failure paths (invalid login, cross-owner edits,
duplicate request/payment, forged/mismatched webhooks, invalid images,
cross-user notification access) are covered across the security/QA suites.

### Reliability

The full suite passes under **randomized order** (`--sequence.shuffle`) and on
**repeated runs** — no flakiness or order-dependence. Concurrency is covered by
the idempotency-key race (payments) and rental-conversion race (rentals).

### Known limitations / status

- **MTN live sandbox:** **NOT AVAILABLE — credentials not configured.** All MTN
  behavior is verified against the provider mock; no live transaction is claimed.
- **Airtel Money (B11):** intentionally **DEFERRED** — no provider/webhook
  implementation exists; `AIRTEL_MONEY` payments produce a plain PENDING intent
  and Airtel webhooks return **501** (verified).
- **Dependency advisories:** dev/build tooling only (see the B13 dependency
  section); `@vitest/coverage-v8` was added for this phase (dev-only). The single
  runtime advisory (`drizzle-orm`) is not exploitable here (no user-controlled
  SQL identifiers) and its 0.45.2 upgrade breaks a regression, so it stays pinned.

> **QA status is not go-live status.** Passing tests establish code-level QA;
> production go-live still requires the external actions in the B13 checklist
> (real MTN sandbox verification, production secrets/config, backups, monitoring,
> WAF/rate-limiting, and legal/compliance review).

---

## Production deployment & handoff (B16)

The backend deploys to **Cloudflare Workers** (D1 + R2). The frontend (separate,
later effort) deploys to **Vercel** and calls the Worker API over HTTPS —
**Vercel does not host this backend**, and there is no frontend code here.

> **Claude Code prepared the repository only. It did NOT deploy, create any
> Cloudflare/GitHub/Vercel resource, set any secret, or push any commit.** Those
> are manual, operator-run steps.

**Full instructions:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) ·
**Go-live checklist:** [`docs/PRODUCTION-CHECKLIST.md`](docs/PRODUCTION-CHECKLIST.md).

### Handoff commands

```bash
npm run validate:production   # check env.production (secret-free; fails until real values are set)
npm run deploy:production      # preflight + prints the manual deploy command; NEVER deploys
API_BASE_URL=https://api.YOUR_DOMAIN.com npm run smoke:production   # read-only health/401 checks
```

`env.production` in [`wrangler.jsonc`](wrangler.jsonc) holds **obvious
placeholders** (`REPLACE_WITH_*`) that Wrangler rejects at deploy time, so a
deploy cannot silently target unconfigured infrastructure.

### Production secret inventory (names only — never commit values)

Set with `wrangler secret put <NAME> --env production`. Required **only** if
enabling live MTN payments: `MTN_MOMO_BASE_URL`, `MTN_MOMO_SUBSCRIPTION_KEY`,
`MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY`, `MTN_MOMO_TARGET_ENVIRONMENT`
(=`mtnrwanda`), `MTN_MOMO_CALLBACK_TOKEN`, and optional `MTN_MOMO_CALLBACK_URL`.
Optional non-secret var: `SESSION_SAMESITE`. **MTN live sandbox verification
remains PENDING** unless real credentials were actually configured and tested.
**Airtel Money integration is deferred until the official current API contract
is verified.**

### Manual production deployment (summary)

Clone → `npm ci` → configure Cloudflare account → create D1 → create R2 → set
non-secret `env.production` values → set secrets → `npm run validate:production`
→ apply D1 migrations (`--remote`) → run the test suite → `npm run build`
(dry-run) → `npx wrangler deploy --env production` → attach custom API domain →
set `FRONTEND_URL` → smoke-test health/auth/public property → confirm
logs/metrics. Do **not** run a real payment unless explicitly approved. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for exact commands, D1 Time Travel
recovery, rollback, monitoring, and edge rate-limiting/WAF guidance.

### GitHub deployment preparation

Recommended monorepo layout: `backend/` (this Worker) and, later, `frontend/`
(Vercel). Before the first commit, confirm **no secrets are committed** —
`.gitignore` already excludes `.dev.vars`, `.env*`, `node_modules/`,
`.wrangler/`, `dist/`, `coverage/`, logs, and temp files. First-commit checklist:
run the full quality gates, run `npm run validate:production` (expected to fail
safely until real values are set), confirm the secret scan is clean, then
`git init` / commit / push **yourself** (Claude Code does not initialize or push
Git).

---

## Project structure

```
backend/
├── src/
│   ├── config/         # env/config validation (Zod)
│   ├── controllers/    # request handlers (health)
│   ├── db/             # Drizzle client + schema/ (7 entities + _shared helpers)
│   ├── lib/            # logger, centralized error/404 handlers
│   ├── middleware/     # request logging
│   ├── repositories/   # (later phases) data-access layer
│   ├── routes/         # Hono routers, versioned under v1
│   ├── services/       # (later phases) business logic
│   ├── types/          # Bindings, Variables, AppEnv
│   ├── utils/          # ApiError, response helpers
│   ├── validators/     # Zod validation mechanism
│   ├── app.ts          # Hono app configuration
│   └── index.ts        # Worker entry (default export)
├── migrations/         # Drizzle/D1 SQL migrations (0000 = initial B1 schema)
├── tests/              # Vitest tests
├── drizzle.config.ts
├── wrangler.jsonc
├── tsconfig.json
├── package.json
├── .env.example
├── .dev.vars.example
└── README.md
```
