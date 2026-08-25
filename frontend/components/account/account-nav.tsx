'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/components/auth/auth-provider';
import {
  ACCOUNT_SECTION_LINKS,
  roleFeatureLinks,
  type NavItem,
} from '@/components/account/account-links';
import { cn } from '@/lib/utils';

/**
 * Role-aware account/section navigation (F8). Used as a sidebar on desktop and a
 * horizontal/stacked list on mobile. The active item is marked with
 * `aria-current="page"` and a non-color cue (weight + a left rail), never color
 * alone. Only links that apply to the current user's role are shown.
 */
export function AccountNav({ className }: { className?: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user) return null;

  const featureLinks = roleFeatureLinks(user.role);

  // Account section links match EXACTLY (so /account doesn't stay active on
  // /account/profile); feature links also match nested detail routes.
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const renderGroup = (heading: string, items: NavItem[], exact: boolean) => (
    <div className="space-y-1">
      <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.href, exact);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md border-l-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary/5 font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <nav aria-label="Account" className={cn('space-y-5', className)}>
      {renderGroup('Account', ACCOUNT_SECTION_LINKS, true)}
      {renderGroup('Activity', featureLinks, false)}
    </nav>
  );
}
