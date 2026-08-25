import { api } from '@/lib/api';
import type { CreateRentalInput, LandlordRental, TenantRental } from '@/types/rental';

/**
 * Rental data access (F5). Reuses the F0 API client (cookie-credentialed,
 * envelope-aware) — NO second HTTP client, NO JWT/Bearer, NO token storage. Every
 * call is authenticated purely by the HttpOnly `rrp_session` cookie
 * (`credentials: 'include'`). Rentals are private and user-specific, so reads use
 * `no-store` — this data is never publicly cached.
 *
 * Integrates the approved B7 endpoints under `/api/v1/rentals`.
 */

// --- Tenant ------------------------------------------------------------------

/**
 * POST /rentals/from-request/:rentalRequestId → the created ACTIVE rental.
 * The only client input is optional dates; identity/money/status are derived
 * server-side from the ACCEPTED request.
 */
export async function createRentalFromRequest(
  rentalRequestId: string,
  input: CreateRentalInput = {},
): Promise<TenantRental> {
  const data = await api.post<{ rental: TenantRental }>(
    `/rentals/from-request/${encodeURIComponent(rentalRequestId)}`,
    input,
  );
  return data.rental;
}

/** GET /rentals/mine → the tenant's own rentals. */
export async function listMyRentals(): Promise<TenantRental[]> {
  const data = await api.get<{ rentals: TenantRental[] }>('/rentals/mine', { cache: 'no-store' });
  return data.rentals;
}

/** GET /rentals/mine/:id → one of the tenant's own rentals. */
export async function getMyRental(id: string): Promise<TenantRental> {
  const data = await api.get<{ rental: TenantRental }>(`/rentals/mine/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  return data.rental;
}

// --- Landlord ----------------------------------------------------------------

/** GET /rentals/landlord → rentals for the landlord's own properties. */
export async function listLandlordRentals(): Promise<LandlordRental[]> {
  const data = await api.get<{ rentals: LandlordRental[] }>('/rentals/landlord', {
    cache: 'no-store',
  });
  return data.rentals;
}

/** GET /rentals/landlord/:id → one rental for a landlord's property. */
export async function getLandlordRental(id: string): Promise<LandlordRental> {
  const data = await api.get<{ rental: LandlordRental }>(
    `/rentals/landlord/${encodeURIComponent(id)}`,
    { cache: 'no-store' },
  );
  return data.rental;
}

/** PATCH /rentals/landlord/:id/complete → the rental, now COMPLETED. */
export async function completeRental(id: string): Promise<LandlordRental> {
  const data = await api.patch<{ rental: LandlordRental }>(
    `/rentals/landlord/${encodeURIComponent(id)}/complete`,
  );
  return data.rental;
}

/** PATCH /rentals/landlord/:id/terminate → the rental, now TERMINATED. */
export async function terminateRental(id: string): Promise<LandlordRental> {
  const data = await api.patch<{ rental: LandlordRental }>(
    `/rentals/landlord/${encodeURIComponent(id)}/terminate`,
  );
  return data.rental;
}
