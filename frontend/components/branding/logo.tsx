import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Brand mark + wordmark for the Rwanda Rental Platform. The mark is an inline
 * SVG (no network/image dependency) using the brand palette via CSS tokens, so
 * it stays crisp and theme-consistent everywhere.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8', className)}
      role="img"
      aria-label="Rwanda Rental Platform logo"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      {/* stylized roof + door — a simple, friendly "home" */}
      <path
        d="M8 15.5 16 9l8 6.5"
        stroke="hsl(var(--accent))"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 15v7.5h11V15"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="14" y="18" width="4" height="4.5" rx="1" className="fill-secondary" />
    </svg>
  );
}

export interface LogoProps {
  className?: string;
  /** Hide the wordmark and show only the mark. */
  markOnly?: boolean;
}

export function Logo({ className, markOnly = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark />
      {!markOnly && (
        <span className="font-display text-base font-semibold leading-tight tracking-tight text-foreground">
          Rwanda Rental
          <span className="block text-xs font-normal text-muted-foreground">Platform</span>
        </span>
      )}
    </span>
  );
}
