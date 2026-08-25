import * as React from 'react';
import { Bath, BedDouble, Home } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PROPERTY_TYPE_LABELS, type PropertyType } from '@/types/property';

export interface PropertyMetaProps {
  propertyType: PropertyType;
  bedrooms: number;
  bathrooms: number;
  className?: string;
}

/** Compact bedrooms / bathrooms / type row with accessible labels. */
export function PropertyMeta({ propertyType, bedrooms, bathrooms, className }: PropertyMetaProps) {
  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <li className="inline-flex items-center gap-1.5">
        <Home className="size-4" aria-hidden="true" />
        <span>{PROPERTY_TYPE_LABELS[propertyType] ?? 'Property'}</span>
      </li>
      <li className="inline-flex items-center gap-1.5">
        <BedDouble className="size-4" aria-hidden="true" />
        <span>
          {bedrooms} <span className="sr-only">bedrooms</span>
          <span aria-hidden="true">{bedrooms === 1 ? 'bed' : 'beds'}</span>
        </span>
      </li>
      <li className="inline-flex items-center gap-1.5">
        <Bath className="size-4" aria-hidden="true" />
        <span>
          {bathrooms} <span className="sr-only">bathrooms</span>
          <span aria-hidden="true">{bathrooms === 1 ? 'bath' : 'baths'}</span>
        </span>
      </li>
    </ul>
  );
}
