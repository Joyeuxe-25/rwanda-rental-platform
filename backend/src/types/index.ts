import type { Session, User } from '../db/schema';
import type { SuccessBody, ErrorBody } from '../utils/apiResponse';

/**
 * Cloudflare Worker bindings available on `c.env`.
 *
 * - `DB`      — Cloudflare D1 database (SQLite). Accessed via Drizzle.
 * - `ASSETS`  — Cloudflare R2 bucket (object storage). Reserved for later phases.
 * - `ENVIRONMENT` / `FRONTEND_URL` — non-secret vars from wrangler.jsonc.
 * - `SESSION_SAMESITE` — optional override for the session cookie SameSite
 *   attribute (`Lax` | `Strict` | `None`); defaults to `Lax`.
 *
 * Secrets (added in later phases via `wrangler secret put`) would also appear
 * here as additional string fields.
 */
export interface Bindings {
  DB: D1Database;
  ASSETS: R2Bucket;
  ENVIRONMENT: string;
  FRONTEND_URL: string;
  SESSION_SAMESITE?: string;

  // --- MTN MoMo (B10) — all secrets; absent = MTN integration inactive. ---
  MTN_MOMO_BASE_URL?: string; // e.g. https://sandbox.momodeveloper.mtn.com
  MTN_MOMO_SUBSCRIPTION_KEY?: string; // Ocp-Apim-Subscription-Key (Collection)
  MTN_MOMO_API_USER?: string; // API user id (UUID)
  MTN_MOMO_API_KEY?: string; // API key for the API user
  MTN_MOMO_TARGET_ENVIRONMENT?: string; // 'sandbox' | 'production'
  MTN_MOMO_CALLBACK_TOKEN?: string; // shared secret we embed in the callback URL
  MTN_MOMO_CALLBACK_URL?: string; // optional X-Callback-Url for request-to-pay
}

/**
 * The authenticated user's safe, public-facing shape (never includes
 * `passwordHash`). Returned by auth endpoints and attached to the context.
 */
export interface SafeUser {
  id: string;
  role: User['role'];
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileImageKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-request values stored on the Hono context via `c.set()` / read via
 * `c.get()`.
 *
 * `user` and `session` are populated by `requireAuth`; downstream handlers on
 * an authenticated route can rely on them (use `getAuthUser(c)` for a
 * non-null accessor).
 */
export interface Variables {
  requestId: string;
  validatedBody?: unknown;
  validatedQuery?: unknown;
  validatedParams?: unknown;
  user?: SafeUser;
  session?: Session;
}

/** Combined Hono environment type used throughout the app. */
export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}

export type { SuccessBody, ErrorBody };
