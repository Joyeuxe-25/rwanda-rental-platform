import type { PropertyType, PropertyStatus } from '@/types/property';

/**
 * Landlord property-management types (F11), mapped from the approved B4/B5
 * contract (`toManagementProperty` + the image serializer). The frontend sends
 * only the editable fields below; server-controlled fields (`id`, `landlordId`,
 * `status`, `isPublished`, `publishedAt`, `currency`, timestamps) are NEVER sent.
 *
 * Field names match the B4 request/response EXACTLY — note the API uses
 * `otherCharges` and `village` (not additionalCharges/villageOrArea).
 */
export interface ManagedProperty {
  id: string;
  /** The owner's own id (returned by the API); never displayed. */
  landlordId: string;
  title: string;
  description: string | null;
  propertyType: PropertyType;
  bedrooms: number;
  bathrooms: number;
  monthlyRent: number;
  securityDeposit: number;
  otherCharges: number;
  currency: string;
  province: string;
  district: string;
  sector: string;
  cell: string | null;
  village: string | null;
  additionalLocation: string | null;
  amenities: string[];
  /** Availability — backend-controlled; the frontend displays but never mutates it. */
  status: PropertyStatus;
  /** Publication — landlord-controlled via publish/unpublish (distinct from status). */
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A managed property image (B5). `url` is a backend relative API path. */
export interface ManagedImage {
  id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

/** The exact editable fields the client may send to create/update (B4 strict). */
export interface PropertyInput {
  title: string;
  description?: string;
  propertyType: PropertyType;
  bedrooms: number;
  bathrooms: number;
  monthlyRent: number;
  securityDeposit: number;
  otherCharges: number;
  province: string;
  district: string;
  sector: string;
  cell?: string;
  village?: string;
  additionalLocation?: string;
  amenities: string[];
}

/** A partial update (only changed fields are sent). */
export type PropertyUpdateInput = Partial<PropertyInput>;
