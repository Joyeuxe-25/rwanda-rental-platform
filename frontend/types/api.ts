/**
 * Foundation API types mirroring the backend response envelope
 * (see `backend/openapi.json`). Domain models are intentionally NOT recreated
 * here in F0 — later phases can generate them from the OpenAPI document.
 */

/** Error payload inside a failed response: `{ message, code, details? }`. */
export interface ApiErrorPayload {
  message: string;
  code: string;
  details?: unknown;
}

/** Success envelope: `{ success: true, data, meta? }`. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/** Error envelope: `{ success: false, error }`. */
export interface ApiFailure {
  success: false;
  error: ApiErrorPayload;
}

/** Any backend response is one of these two shapes. */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Pagination block returned by list endpoints (e.g. notifications). */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
