import * as React from 'react';
import Link from 'next/link';

import { PropertyAmenities } from '@/components/properties/property-amenities';
import { PropertyImage } from '@/components/properties/property-image';
import { PropertyLocation } from '@/components/properties/property-location';
import { PropertyMeta } from '@/components/properties/property-meta';
import { PropertyStatusBadge } from '@/components/properties/property-status-badge';
import { formatMonthlyRent } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PublicProperty } from '@/types/property';

/** A summary of a public property suitable for the marketplace grid. */
export type PropertyCardData = Pick<
  PublicProperty,
  | 'id'
  | 'title'
  | 'propertyType'
  | 'monthlyRent'
  | 'currency'
  | 'bedrooms'
  | 'bathrooms'
  | 'amenities'
  | 'status'
  | 'province'
  | 'district'
  | 'sector'
  | 'cell'
  | 'village'
  | 'additionalLocation'
> & {
  images?: PublicProperty['images'];
  landlord?: PublicProperty['landlord'];
};

/**
 * Reusable, keyboard-accessible property card. Uses the "stretched link" pattern:
 * the title is the single focusable link whose overlay makes the whole card
 * clickable, so screen-reader users get one clear link name and the card shows a
 * focus ring. Displays only safe public fields (landlord name only, no contact).
 */
export function PropertyCard({
  property,
  className,
}: {
  property: PropertyCardData;
  className?: string;
}) {
  const primary =
    property.images?.find((i) => i.isPrimary) ??
    [...(property.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0] ??
    null;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-soft transition-shadow hover:shadow-card',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        className,
      )}
    >
      <PropertyImage image={primary} alt={property.title} className="aspect-[4/3] w-full" />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-snug tracking-tight">
            <Link
              href={`/properties/${property.id}`}
              className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none"
            >
              {property.title}
            </Link>
          </h3>
          <PropertyStatusBadge status={property.status} className="shrink-0" />
        </div>

        <p className="text-sm font-semibold text-foreground">
          {formatMonthlyRent(property.monthlyRent, property.currency)}
        </p>

        <PropertyLocation property={property} />
        <PropertyMeta
          propertyType={property.propertyType}
          bedrooms={property.bedrooms}
          bathrooms={property.bathrooms}
        />

        {property.landlord && (
          <p className="text-caption">
            Listed by {property.landlord.firstName} {property.landlord.lastName}
          </p>
        )}

        <PropertyAmenities amenities={property.amenities} variant="preview" className="mt-1" />
      </div>
    </article>
  );
}
