import * as React from 'react';
import { MapPin } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PublicProperty } from '@/types/property';

type LocationFields = Pick<
  PublicProperty,
  'province' | 'district' | 'sector' | 'cell' | 'village' | 'additionalLocation'
>;

/** Build a human-readable, most-specific-first location line from present fields. */
export function locationSummary(p: LocationFields): string {
  return [p.sector, p.district, p.province].filter(Boolean).join(', ');
}

export interface PropertyLocationProps {
  property: LocationFields;
  /** `inline` = single summary line; `detailed` = full labelled breakdown. */
  variant?: 'inline' | 'detailed';
  className?: string;
}

/**
 * Human-readable Rwanda location. Only fields actually provided are shown; there
 * is intentionally NO latitude/longitude (landlords are not required to supply it).
 */
export function PropertyLocation({
  property,
  variant = 'inline',
  className,
}: PropertyLocationProps) {
  if (variant === 'inline') {
    return (
      <p
        className={cn('inline-flex items-center gap-1.5 text-sm text-muted-foreground', className)}
      >
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        <span>{locationSummary(property)}</span>
      </p>
    );
  }

  const rows: { label: string; value: string | null }[] = [
    { label: 'Province', value: property.province },
    { label: 'District', value: property.district },
    { label: 'Sector', value: property.sector },
    { label: 'Cell', value: property.cell },
    { label: 'Village / Area', value: property.village },
    { label: 'Additional', value: property.additionalLocation },
  ];

  return (
    <dl className={cn('grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2', className)}>
      {rows
        .filter((r) => r.value)
        .map((r) => (
          <div key={r.label} className="flex flex-col">
            <dt className="text-caption">{r.label}</dt>
            <dd className="text-sm text-foreground">{r.value}</dd>
          </div>
        ))}
    </dl>
  );
}
