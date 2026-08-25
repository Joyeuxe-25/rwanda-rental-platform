import * as React from 'react';
import { Check } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface PropertyAmenitiesProps {
  amenities: string[];
  /** `preview` shows up to `max` as compact badges; `full` lists them all. */
  variant?: 'preview' | 'full';
  max?: number;
  className?: string;
}

/**
 * Amenities from the backend. Handles empty, many, and long names gracefully.
 * Never invents amenities.
 */
export function PropertyAmenities({
  amenities,
  variant = 'full',
  max = 4,
  className,
}: PropertyAmenitiesProps) {
  const items = Array.isArray(amenities) ? amenities.filter(Boolean) : [];
  if (items.length === 0) {
    if (variant === 'preview') return null;
    return <p className={cn('text-sm text-muted-foreground', className)}>No amenities listed.</p>;
  }

  if (variant === 'preview') {
    const shown = items.slice(0, max);
    const extra = items.length - shown.length;
    return (
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        {shown.map((a) => (
          <Badge key={a} variant="neutral" className="max-w-[12rem] truncate">
            {a}
          </Badge>
        ))}
        {extra > 0 && (
          <Badge variant="outline">
            +{extra} more<span className="sr-only"> amenities</span>
          </Badge>
        )}
      </div>
    );
  }

  return (
    <ul className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', className)}>
      {items.map((a) => (
        <li key={a} className="inline-flex items-start gap-2 text-sm text-foreground">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span className="break-words">{a}</span>
        </li>
      ))}
    </ul>
  );
}
