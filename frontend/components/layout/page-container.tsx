import * as React from 'react';

import { cn } from '@/lib/utils';

const sizeMap = {
  /** Readable content width (articles, forms, auth). */
  content: 'max-w-3xl',
  /** Default app width (most pages). */
  default: 'max-w-6xl',
  /** Wider marketplace/listing width. */
  wide: 'max-w-7xl',
  /** Edge-to-edge (the caller manages inner width). */
  full: 'max-w-none',
} as const;

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof sizeMap;
}

/** Centered, responsive content width with consistent gutters. */
export function PageContainer({ className, size = 'default', ...props }: PageContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', sizeMap[size], className)}
      {...props}
    />
  );
}
