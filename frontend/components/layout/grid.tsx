import * as React from 'react';

import { cn } from '@/lib/utils';

const colsMap = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
} as const;

const gapMap = {
  sm: 'gap-3',
  md: 'gap-5',
  lg: 'gap-8',
} as const;

/** Responsive grid with sensible column breakpoints. */
export function Grid({
  className,
  cols = 3,
  gap = 'md',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  cols?: keyof typeof colsMap;
  gap?: keyof typeof gapMap;
}) {
  return <div className={cn('grid', colsMap[cols], gapMap[gap], className)} {...props} />;
}
