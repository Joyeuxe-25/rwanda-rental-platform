import * as React from 'react';
import { BedDouble, Bath, MapPin } from 'lucide-react';

import { PropertyImage } from '@/components/properties/property-image';
import { PropertyStatusBadge } from '@/components/properties/property-status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatMonthlyRent } from '@/lib/format';
import { PROPERTY_TYPE_LABELS } from '@/types/property';
import type { PublicProperty } from '@/types/property';

/**
 * Compact property context shown on the rental-request page (F4). Uses only safe
 * public fields (no landlord contact details) so the tenant can confirm what they
 * are requesting. Backed by the public property endpoint, so it can show the
 * primary image (the B6 request summary itself carries no images).
 */
export function RequestPropertySummary({ property }: { property: PublicProperty }) {
  const primary = property.images.find((i) => i.isPrimary) ?? property.images[0];
  const location = [property.sector, property.district, property.province]
    .filter(Boolean)
    .join(', ');

  return (
    <Card className="overflow-hidden">
      <div className="grid sm:grid-cols-[9rem_1fr]">
        <PropertyImage
          image={primary}
          alt={property.title}
          className="aspect-video h-full w-full sm:aspect-auto"
        />
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-h4 font-semibold">{property.title}</h2>
            <PropertyStatusBadge status={property.status} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {formatMonthlyRent(property.monthlyRent, property.currency)}
          </p>
          {location && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {location}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>{PROPERTY_TYPE_LABELS[property.propertyType]}</span>
            <span className="flex items-center gap-1">
              <BedDouble className="size-4" aria-hidden="true" />
              {property.bedrooms} bd
            </span>
            <span className="flex items-center gap-1">
              <Bath className="size-4" aria-hidden="true" />
              {property.bathrooms} ba
            </span>
          </p>
        </CardContent>
      </div>
    </Card>
  );
}
