import * as React from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';

import { PropertyStatusBadge } from '@/components/properties/property-status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatMonthlyRent } from '@/lib/format';
import { PROPERTY_TYPE_LABELS, type PropertyStatus, type PropertyType } from '@/types/property';
import type { RentalPropertySummary } from '@/types/rental';

/**
 * Property context on a rental detail/card (F5), built from the B7 rental
 * property summary + the rental's snapshotted rent. Links to the public property
 * page. Never shows the other party's contact details.
 */
export function RentalPropertySummaryBlock({
  property,
  monthlyRent,
  currency,
}: {
  property: RentalPropertySummary;
  monthlyRent: number;
  currency: string;
}) {
  const location = [property.sector, property.district].filter(Boolean).join(', ');
  const typeLabel = PROPERTY_TYPE_LABELS[property.propertyType as PropertyType] ?? 'Property';

  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-h4 font-semibold">
            <Link
              href={`/properties/${property.id}`}
              className="underline-offset-4 hover:underline"
            >
              {property.title}
            </Link>
          </h2>
          <PropertyStatusBadge status={property.status as PropertyStatus} />
        </div>
        <p className="text-sm font-medium text-foreground">
          {formatMonthlyRent(monthlyRent, currency)}
        </p>
        <p className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>{typeLabel}</span>
          {location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {location}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
