import * as React from 'react';

import { cn } from '@/lib/utils';

const gapMap = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
} as const;

type Gap = keyof typeof gapMap;

/** Vertical flex stack with a consistent gap scale. */
export function Stack({
  className,
  gap = 'md',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { gap?: Gap }) {
  return <div className={cn('flex flex-col', gapMap[gap], className)} {...props} />;
}

/** Horizontal flex row with a consistent gap scale; wraps by default. */
export function Inline({
  className,
  gap = 'md',
  wrap = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { gap?: Gap; wrap?: boolean }) {
  return (
    <div
      className={cn('flex items-center', wrap && 'flex-wrap', gapMap[gap], className)}
      {...props}
    />
  );
}
