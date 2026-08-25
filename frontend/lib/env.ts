/**
 * Public frontend configuration.
 *
 * Only NEXT_PUBLIC_* values are exposed to the browser. There are NO secrets
 * here — authentication is handled server-side by the backend via an HttpOnly
 * cookie, never by a token stored on the client.
 */

/** Default local API base; overridden by `NEXT_PUBLIC_API_URL` in `.env`. */
export const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

/** The backend API base URL (e.g. `http://localhost:4000/api/v1`). */
export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') ?? DEFAULT_API_BASE_URL;

/** Accessor (handy for tests and to avoid importing the constant directly). */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/**
 * The API server ORIGIN (scheme + host + port) without the `/api/v1` path.
 * Backend image URLs are returned as absolute API paths (e.g.
 * `/api/v1/properties/…/images/…`), so they are rendered as `${API_ORIGIN}${url}`.
 */
export const API_ORIGIN: string = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return 'http://localhost:4000';
  }
})();

/** Build an absolute URL for a backend-provided relative image/API path. */
export function toApiUrl(relativePath: string): string {
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return `${API_ORIGIN}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
}
