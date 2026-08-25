/**
 * Public property view types, mapped explicitly from the backend
 * `PublicProperty` schema in `backend/openapi.json` (the authoritative contract).
 * Only SAFE public fields are modeled — the landlord is display-identity only
 * (no email/phone), and no storage keys are exposed.
 */

export type PropertyType = 'APARTMENT' | 'HOUSE' | 'ROOM' | 'STUDIO' | 'OTHER';
export type PropertyStatus = 'AVAILABLE' | 'OCCUPIED' | 'UNAVAILABLE';

/** Public image reference. `url` is a backend-provided relative API path. */
export interface PublicImage {
  id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

/** Public display identity of the landlord (never contact details). */
export interface PublicPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PublicProperty {
  id: string;
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
  status: PropertyStatus;
  landlord: PublicPerson;
  images: PublicImage[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A public list card (the `GET /api/v1/properties` item — B17 `PublicPropertyCard`).
 * Same flat, listing-safe shape as `PublicProperty` minus the full `description`;
 * `images` carries the primary image only.
 */
export interface PropertyListItem {
  id: string;
  title: string;
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
  status: PropertyStatus;
  landlord: PublicPerson;
  images: PublicImage[];
  publishedAt: string | null;
  createdAt: string;
}

/** Pagination block from the public list endpoint. */
export interface PropertyPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Sort options exposed by the B17 endpoint. */
export type PropertySort = 'newest' | 'rent_asc' | 'rent_desc';

/** Human-readable label for a property type. */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
  ROOM: 'Room',
  STUDIO: 'Studio',
  OTHER: 'Property',
};
