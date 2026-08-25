'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/components/auth/auth-provider';
import { LogoutButton } from '@/components/auth/logout-button';
import { roleFeatureLinks } from '@/components/account/account-links';
import { UserAvatar } from '@/components/account/user-avatar';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Auth-aware header controls (desktop). Anonymous: Sign in + Create account.
 * Authenticated: role-aware feature links (active-state aware), the notification
 * bell, an avatar+name link to the account, and Sign out. A brief skeleton during
 * hydration avoids a flash between states.
 */
export function AuthNav() {
  const { status, user } = useAuth();
  const pathname = usePathname();

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2" aria-hidden="true">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-28" />
      </div>
    );
  }

  if (status === 'authenticated' && user) {
    // Feature links minus Notifications (the bell handles that).
    const links = roleFeatureLinks(user.role).filter((l) => l.href !== '/notifications');
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
    const accountActive = pathname === '/account' || pathname.startsWith('/account/');

    return (
      <div className="flex items-center gap-1">
        {links.map((l) => {
          const active = isActive(l.href);
          return (
            <Button
              key={l.href}
              variant="ghost"
              size="sm"
              asChild
              className={cn(active && 'font-semibold text-foreground underline underline-offset-4')}
            >
              <Link href={l.href} aria-current={active ? 'page' : undefined}>
                {l.label}
              </Link>
            </Button>
          );
        })}
        <NotificationBell />
        <Button variant="ghost" size="sm" asChild className={cn(accountActive && 'bg-muted')}>
          <Link href="/account" aria-current={accountActive ? 'page' : undefined}>
            <UserAvatar firstName={user.firstName} lastName={user.lastName} size="sm" />
            <span className="max-w-[8rem] truncate">{user.firstName}</span>
          </Link>
        </Button>
        <LogoutButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
      <Button size="sm" asChild>
        <Link href="/register">Create account</Link>
      </Button>
    </div>
  );
}
