import { api, ApiRequestError } from '@/lib/api';
import type {
  PropertyListItem,
  PropertyPagination,
  PropertySort,
  PublicProperty,
} from '@/types/property';

/**
 * Public property data access (F2 / F2-R). Reuses the F0 API client
 * (cookie-credentialed, envelope-aware). Public reads work anonymously.
 *
 * Integrates the B17 public endpoints:
 *   - `GET /api/v1/properties`      → published-only discovery list (F2-R)
 *   - `GET /api/v1/properties/:id`  → published property detail (F2)
 */

/** Filters/params accepted by the public list. Mirrors the B17 contract exactly. */
export interface PropertyListParams {
  page?: number;
  limit?: number;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  villageOrArea?: string;
  propertyType?: string;
  status?: string;
  minRent?: number;
  maxRent?: number;
  bedrooms?: number;
  bathrooms?: number;
  q?: string;
  sort?: PropertySort;
}

export interface PropertyListResult {
  properties: PropertyListItem[];
  pagination: PropertyPagination;
}

/**
 * The ONLY query keys sent to the backend (the documented B17 parameters). Any
 * other key in the URL is ignored, so the frontend never sends an undocumented
 * parameter. `sort`/`page`/`limit` are always meaningful.
 */
export const PROPERTY_FILTER_KEYS = [
  'province',
  'district',
  'sector',
  'cell',
  'villageOrArea',
  'propertyType',
  'status',
  'minRent',
  'maxRent',
  'bedrooms',
  'bathrooms',
  'q',
] as const;

const NUMERIC_KEYS = new Set(['page', 'limit', 'minRent', 'maxRent', 'bedrooms', 'bathrooms']);
const SORTS: PropertySort[] = ['newest', 'rent_asc', 'rent_desc'];

/** Serialize params into a `?a=b&c=d` string, dropping empty/undefined values. */
function toQueryString(params: PropertyListParams): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    usp.set(key, String(value));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/**
 * Parse raw Next.js `searchParams` into a validated `PropertyListParams`,
 * keeping ONLY documented keys and coercing numbers. Junk/undocumented params
 * are ignored (never forwarded). Defaults: page 1, limit 12, sort newest.
 */
export function parsePropertyListParams(
  raw: Record<string, string | string[] | undefined>,
): PropertyListParams {
  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const out: PropertyListParams = {};

  for (const key of PROPERTY_FILTER_KEYS) {
    const v = first(raw[key])?.trim();
    if (!v) continue;
    if (NUMERIC_KEYS.has(key)) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0) (out as Record<string, unknown>)[key] = n;
    } else {
      (out as Record<string, unknown>)[key] = v;
    }
  }

  const page = Number(first(raw.page));
  out.page = Number.isInteger(page) && page >= 1 ? page : 1;
  const limit = Number(first(raw.limit));
  out.limit = Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : 12;

  const sort = first(raw.sort) as PropertySort | undefined;
  out.sort = sort && SORTS.includes(sort) ? sort : 'newest';

  return out;
}

/** True when any discovery FILTER (not page/limit/sort) is active. */
export function hasActiveFilters(params: PropertyListParams): boolean {
  return PROPERTY_FILTER_KEYS.some((k) => params[k] !== undefined && params[k] !== '');
}

/**
 * Fetch a page of published properties (B17). Public/anonymous. Discovery must
 * reflect landlord publish/unpublish actions promptly, so this read bypasses
 * the Next.js data cache. Errors propagate as `ApiRequestError` for the caller
 * to render a friendly state.
 */
export async function listPublishedProperties(
  params: PropertyListParams,
): Promise<PropertyListResult> {
  return api.get<PropertyListResult>(`/properties${toQueryString(params)}`, {
    cache: 'no-store',
  });
}

/**
 * Fetch a single published property by id. Returns `null` on 404 (not found /
 * unpublished) so callers can render a not-found experience; other errors throw
 * (handled by the route error boundary). Public detail reads bypass the
 * Next.js data cache so publish/unpublish state is reflected immediately.
 *
 * The options parameter is retained for call-site compatibility; public detail
 * reads are always fresh because publication state is user-visible.
 */
export async function getPublicProperty(
  id: string,
  _opts: { fresh?: boolean } = {},
): Promise<PublicProperty | null> {
  try {
    const data = await api.get<{ property: PublicProperty }>(
      `/properties/${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    );
    return data.property ?? null;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
}
