import * as React from 'react';
import Link from 'next/link';
import { MapPin, ChevronRight } from 'lucide-react';

import { RentalRequestStatusBadge } from '@/components/rental-requests/rental-request-status-badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatMonthlyRent } from '@/lib/format';
import type { TenantRentalRequest } from '@/types/rental-request';

/**
 * A tenant's own request in the list (F4). The B6 property summary carries no
 * image, so the card is text-first: title, rent, location, status, submitted
 * date. Never shows landlord contact details.
 */
export function TenantRequestCard({ request }: { request: TenantRentalRequest }) {
  const p = request.property;
  const location = p ? [p.sector, p.district].filter(Boolean).join(', ') : null;

  return (
    <Card className="transition-colors hover:border-primary/40">
      <Link
        href={`/requests/${request.id}`}
        className="flex items-center gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display font-semibold text-foreground">
              {p?.title ?? 'Property'}
            </h3>
            <RentalRequestStatusBadge status={request.status} />
          </div>
          {p && (
            <p className="text-sm font-medium text-foreground">
              {formatMonthlyRent(p.monthlyRent, p.currency)}
            </p>
          )}
          {location && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {location}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Submitted {formatDate(request.createdAt)}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </Card>
  );
}
