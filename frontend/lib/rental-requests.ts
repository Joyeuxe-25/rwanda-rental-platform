import { api } from '@/lib/api';
import type {
  CreateRentalRequestInput,
  LandlordRentalRequest,
  TenantRentalRequest,
} from '@/types/rental-request';

/**
 * Rental-request data access (F4). Reuses the F0 API client (cookie-credentialed,
 * envelope-aware) — NO second HTTP client, NO JWT/Bearer, NO token storage. Every
 * call is authenticated purely by the HttpOnly `rrp_session` cookie
 * (`credentials: 'include'`). Reads use `no-store` so a tenant/landlord always
 * sees fresh, authorized state (never a cached list).
 *
 * Integrates the approved B6 endpoints under `/api/v1/rental-requests`.
 */

// --- Tenant ------------------------------------------------------------------

/** POST /rental-requests → the created request (status PENDING). */
export async function createRentalRequest(
  input: CreateRentalRequestInput,
): Promise<TenantRentalRequest> {
  const data = await api.post<{ rentalRequest: TenantRentalRequest }>('/rental-requests', input);
  return data.rentalRequest;
}

/** GET /rental-requests/mine → the tenant's own requests. */
export async function listMyRentalRequests(): Promise<TenantRentalRequest[]> {
  const data = await api.get<{ rentalRequests: TenantRentalRequest[] }>('/rental-requests/mine', {
    cache: 'no-store',
  });
  return data.rentalRequests;
}

/** GET /rental-requests/mine/:id → one of the tenant's own requests. */
export async function getMyRentalRequest(id: string): Promise<TenantRentalRequest> {
  const data = await api.get<{ rentalRequest: TenantRentalRequest }>(
    `/rental-requests/mine/${encodeURIComponent(id)}`,
    { cache: 'no-store' },
  );
  return data.rentalRequest;
}

/** PATCH /rental-requests/mine/:id/cancel → the request, now CANCELLED. */
export async function cancelMyRentalRequest(id: string): Promise<TenantRentalRequest> {
  const data = await api.patch<{ rentalRequest: TenantRentalRequest }>(
    `/rental-requests/mine/${encodeURIComponent(id)}/cancel`,
  );
  return data.rentalRequest;
}

// --- Landlord ----------------------------------------------------------------

/** GET /rental-requests/landlord → requests for the landlord's own properties. */
export async function listLandlordRentalRequests(): Promise<LandlordRentalRequest[]> {
  const data = await api.get<{ rentalRequests: LandlordRentalRequest[] }>(
    '/rental-requests/landlord',
    { cache: 'no-store' },
  );
  return data.rentalRequests;
}

/** GET /rental-requests/landlord/:id → one request for a landlord's property. */
export async function getLandlordRentalRequest(id: string): Promise<LandlordRentalRequest> {
  const data = await api.get<{ rentalRequest: LandlordRentalRequest }>(
    `/rental-requests/landlord/${encodeURIComponent(id)}`,
    { cache: 'no-store' },
  );
  return data.rentalRequest;
}

/** PATCH /rental-requests/landlord/:id/approve → the request, now ACCEPTED. */
export async function approveRentalRequest(id: string): Promise<LandlordRentalRequest> {
  const data = await api.patch<{ rentalRequest: LandlordRentalRequest }>(
    `/rental-requests/landlord/${encodeURIComponent(id)}/approve`,
  );
  return data.rentalRequest;
}

/** PATCH /rental-requests/landlord/:id/reject → the request, now REJECTED. */
export async function rejectRentalRequest(id: string): Promise<LandlordRentalRequest> {
  const data = await api.patch<{ rentalRequest: LandlordRentalRequest }>(
    `/rental-requests/landlord/${encodeURIComponent(id)}/reject`,
  );
  return data.rentalRequest;
}
