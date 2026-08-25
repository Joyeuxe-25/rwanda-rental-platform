import * as React from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import type { PaymentPropertySummary } from '@/types/payment';

/**
 * Property context on a payment detail (F6), built from the B8 payment property
 * summary (no images/money — the money lives on the payment). Links to the public
 * property page. Never shows the other party's contact details.
 */
export function PaymentPropertySummaryBlock({ property }: { property: PaymentPropertySummary }) {
  const location = [property.sector, property.district].filter(Boolean).join(', ');
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <h2 className="text-h4 font-semibold">
          <Link href={`/properties/${property.id}`} className="underline-offset-4 hover:underline">
            {property.title}
          </Link>
        </h2>
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
