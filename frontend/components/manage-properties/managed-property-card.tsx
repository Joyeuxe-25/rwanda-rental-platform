'use client';

import * as React from 'react';
import Link from 'next/link';

import { PropertyImage } from '@/components/properties/property-image';
import { PropertyStatusBadge } from '@/components/properties/property-status-badge';
import { PublicationBadge } from '@/components/manage-properties/property-badges';
import { Card } from '@/components/ui/card';
import { formatMonthlyRent } from '@/lib/format';
import { listPropertyImages } from '@/lib/managed-properties';
import { PROPERTY_TYPE_LABELS } from '@/types/property';
import type { ManagedImage, ManagedProperty } from '@/types/managed-property';

/**
 * A single row in the landlord's My Properties list (F11). Shows publication
 * (landlord-controlled) and availability (backend-controlled) as SEPARATE
 * badges, and links to the management detail page. No payment UI.
 */
export function ManagedPropertyCard({ property }: { property: ManagedProperty }) {
  const [primaryImage, setPrimaryImage] = React.useState<ManagedImage | null>(null);

  React.useEffect(() => {
    let active = true;
    void listPropertyImages(property.id)
      .then((images) => {
        if (!active) return;
        setPrimaryImage(images.find((image) => image.isPrimary) ?? images[0] ?? null);
      })
      .catch(() => {
        // The property remains useful without an image if the gallery request fails.
      });

    return () => {
      active = false;
    };
  }, [property.id]);

  const location = [property.sector, property.district, property.province]
    .filter(Boolean)
    .join(', ');

  return (
    <Card className="transition-colors hover:border-primary/40">
      <Link
        href={`/landlord/properties/${property.id}`}
        className="flex gap-4 rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <PropertyImage
          image={primaryImage}
          alt={`${property.title} primary image`}
          className="h-20 w-28 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <PublicationBadge isPublished={property.isPublished} />
            <PropertyStatusBadge status={property.status} />
          </div>
          <h3 className="truncate font-display text-base font-semibold text-foreground">
            {property.title}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {PROPERTY_TYPE_LABELS[property.propertyType]}
            {location ? ` · ${location}` : ''}
          </p>
          <p className="text-sm font-medium text-foreground">
            {formatMonthlyRent(property.monthlyRent, property.currency)}
          </p>
        </div>
      </Link>
    </Card>
  );
}
