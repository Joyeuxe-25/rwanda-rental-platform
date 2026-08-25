/**
 * API client foundation (F0).
 *
 * A thin, reusable wrapper over `fetch` that:
 *  - targets the backend base URL from `NEXT_PUBLIC_API_URL`,
 *  - sends `credentials: 'include'` so the backend's HttpOnly session cookie
 *    (`rrp_session`) rides along — this is the ONLY auth mechanism. There is no
 *    token storage, no localStorage, and no Authorization/Bearer header.
 *  - preserves the backend success/error envelope and normalizes failures into
 *    a thrown `ApiRequestError`.
 *
 * F0 does NOT wire this to any product screen; it only establishes the shape.
 */
import { API_BASE_URL } from './env';
import type { ApiResponse } from '@/types/api';

/** Normalized error thrown on a non-2xx response or a failure envelope. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Json = Record<string, unknown> | unknown[] | null;
// Request bodies may be any JSON-serializable value (typed interfaces included).
type JsonBody = Json | object;

interface RequestOptions {
  /** Extra headers (never put secrets here). */
  headers?: Record<string, string>;
  /** AbortSignal for cancellation/timeouts. */
  signal?: AbortSignal;
  /** Fetch cache mode (server components), e.g. 'no-store'. */
  cache?: RequestCache;
  /** Next.js revalidation options for server-side fetches. */
  next?: { revalidate?: number | false; tags?: string[] };
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: JsonBody,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include', // send the HttpOnly session cookie
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options.signal,
      ...(options.cache ? { cache: options.cache } : {}),
      ...(options.next ? { next: options.next } : {}),
    });
  } catch {
    // Network/transport failure — never echo the request (avoid leaking data).
    throw new ApiRequestError('Network request failed', 'NETWORK_ERROR', 0);
  }

  // Some endpoints (e.g. image bytes) are not JSON; callers use `raw` for those.
  const payload = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !payload || payload.success === false) {
    const err = payload && payload.success === false ? payload.error : undefined;
    throw new ApiRequestError(
      err?.message ?? 'Request failed',
      err?.code ?? 'REQUEST_FAILED',
      res.status,
      err?.details,
    );
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: JsonBody, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: JsonBody, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
  /** The raw Response, for non-JSON endpoints (e.g. image bytes). Still credentialed. */
  raw: (path: string, init?: RequestInit) =>
    fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
      credentials: 'include',
      ...init,
    }),
};
