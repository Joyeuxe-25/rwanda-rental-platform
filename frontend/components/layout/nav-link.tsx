'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** Larger tap targets + block layout for the mobile sheet. */
  variant?: 'header' | 'mobile';
  onNavigate?: () => void;
}

/**
 * Reusable navigation link with default/hover/active/focus states. The active
 * state is conveyed by BOTH weight/color and an underline indicator (not color
 * alone), plus `aria-current="page"` for assistive tech.
 */
export function NavLink({
  href,
  children,
  className,
  variant = 'header',
  onNavigate,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variant === 'header' &&
          cn(
            'relative px-1 py-1 text-sm text-muted-foreground hover:text-foreground',
            'after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:rounded-full after:bg-accent after:transition-transform hover:after:scale-x-100',
            isActive && 'text-foreground after:scale-x-100',
          ),
        variant === 'mobile' &&
          cn(
            'flex items-center rounded-lg px-3 py-2.5 text-base text-foreground hover:bg-muted',
            isActive && 'bg-muted font-semibold',
          ),
        className,
      )}
    >
      {children}
    </Link>
  );
}
