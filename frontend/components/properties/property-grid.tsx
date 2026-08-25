import * as React from 'react';

import { PropertyCard, type PropertyCardData } from '@/components/properties/property-card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const gridClass = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

/** Responsive property grid (1 / 2 / 3 columns). Ready for the list API. */
export function PropertyGrid({
  properties,
  className,
}: {
  properties: PropertyCardData[];
  className?: string;
}) {
  return (
    <div className={cn(gridClass, className)}>
      {properties.map((p) => (
        <PropertyCard key={p.id} property={p} />
      ))}
    </div>
  );
}

/** One card skeleton, matching the card's shape (no layout shift). */
export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/** Grid of skeleton cards for loading states. */
export function PropertyGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={gridClass} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <PropertyCardSkeleton key={i} />
      ))}
    </div>
  );
}
