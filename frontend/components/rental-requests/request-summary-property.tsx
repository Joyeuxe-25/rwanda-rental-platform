import * as React from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';

import { PropertyStatusBadge } from '@/components/properties/property-status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatMonthlyRent } from '@/lib/format';
import type { PropertyStatus } from '@/types/property';
import type { RequestPropertySummary } from '@/types/rental-request';

/**
 * Property context on a request detail page (F4), built from the B6 request
 * `propertySummary` (no images/bedrooms — that is the public endpoint's job).
 * Links to the public property page. Never shows landlord contact details.
 */
export function RequestSummaryProperty({ property }: { property: RequestPropertySummary }) {
  const location = [property.sector, property.district].filter(Boolean).join(', ');

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
          {formatMonthlyRent(property.monthlyRent, property.currency)}
        </p>
        {location && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {location}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
