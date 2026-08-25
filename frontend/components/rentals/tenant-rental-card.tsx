import * as React from 'react';
import Link from 'next/link';
import { MapPin, ChevronRight } from 'lucide-react';

import { RentalStatusBadge } from '@/components/rentals/rental-status-badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatMonthlyRent } from '@/lib/format';
import type { TenantRental } from '@/types/rental';

/**
 * A tenant's own rental in the list (F5). The B7 property summary carries no
 * image, so the card is text-first: title, rent, location, status, start date.
 * Never shows landlord contact details.
 */
export function TenantRentalCard({ rental }: { rental: TenantRental }) {
  const p = rental.property;
  const location = [p.sector, p.district].filter(Boolean).join(', ');

  return (
    <Card className="transition-colors hover:border-primary/40">
      <Link
        href={`/rentals/${rental.id}`}
        className="flex items-center gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display font-semibold text-foreground">{p.title}</h3>
            <RentalStatusBadge status={rental.status} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {formatMonthlyRent(rental.monthlyRent, rental.currency)}
          </p>
          {location && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {location}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Started {formatDate(rental.startDate)}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </Card>
  );
}
