/**
 * Rental-request view types, mapped explicitly from the approved backend B6
 * contract (`backend/openapi.json` + the rental-request service). The frontend
 * NEVER sends server-controlled fields (tenantId, landlordId, status, id,
 * timestamps): the create body is `propertyId` + optional `message` only, and
 * the tenant identity is derived from the session cookie.
 */

/** Backend rental-request lifecycle. Note: acceptance is `ACCEPTED`, not APPROVED. */
export type RentalRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/**
 * Compact, safe property summary embedded in every request response. This is the
 * B6 `propertySummary` — it deliberately does NOT include images or the full
 * description (that is the public property endpoint's job).
 */
export interface RequestPropertySummary {
  id: string;
  title: string;
  propertyType: string;
  monthlyRent: number;
  currency: string;
  district: string;
  sector: string;
  status: string;
  isPublished: boolean;
}

/** Tenant-facing request (the property summary is present on list/detail). */
export interface TenantRentalRequest {
  id: string;
  propertyId: string;
  status: RentalRequestStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  property?: RequestPropertySummary;
}

/** The safe tenant identity a landlord may see (name only — no email/phone). */
export interface RequestTenantIdentity {
  id: string;
  firstName: string;
  lastName: string;
}

/** Landlord-facing request (always carries the property summary + tenant name). */
export interface LandlordRentalRequest {
  id: string;
  propertyId: string;
  status: RentalRequestStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  property: RequestPropertySummary;
  tenant: RequestTenantIdentity;
}

/** The ONLY fields the client sends when creating a request (B6 strict schema). */
export interface CreateRentalRequestInput {
  propertyId: string;
  message?: string;
}

/** True while a request is still in flight (a terminal state cannot transition). */
export function isTerminalStatus(status: RentalRequestStatus): boolean {
  return status !== 'PENDING';
}
