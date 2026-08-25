'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';

import { useAuth } from '@/components/auth/auth-provider';
import { LogoutButton } from '@/components/auth/logout-button';
import { useNotificationCount } from '@/components/notifications/notification-provider';
import { Logo } from '@/components/branding/logo';
import { NavLink } from '@/components/layout/nav-link';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { primaryNav } from '@/lib/nav';

/**
 * Mobile navigation via an accessible Sheet (Radix Dialog): keyboard operable,
 * Escape closes, focus is trapped and restored, and selecting a link closes the
 * sheet. Shown only on small screens (the header hides it on desktop).
 */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const { status, user } = useAuth();
  const { unreadCount } = useNotificationCount();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="lg:hidden">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-4/5 max-w-xs">
        <SheetHeader>
          <SheetTitle className="text-left">
            <Logo />
          </SheetTitle>
          <SheetDescription className="text-left">Browse the platform</SheetDescription>
        </SheetHeader>

        <nav aria-label="Mobile" className="mt-6 flex flex-col gap-1">
          {primaryNav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              variant="mobile"
              onNavigate={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 space-y-2 border-t border-border pt-6">
          {status === 'authenticated' && user ? (
            <>
              <Button variant="outline" asChild className="w-full">
                <Link
                  href={user.role === 'LANDLORD' ? '/landlord/requests' : '/requests'}
                  onClick={() => setOpen(false)}
                >
                  {user.role === 'LANDLORD' ? 'Rental requests' : 'My requests'}
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link
                  href={user.role === 'LANDLORD' ? '/landlord/rentals' : '/rentals'}
                  onClick={() => setOpen(false)}
                >
                  {user.role === 'LANDLORD' ? 'Rentals' : 'My rentals'}
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link
                  href={user.role === 'LANDLORD' ? '/landlord/payments' : '/payments'}
                  onClick={() => setOpen(false)}
                >
                  Payments
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  aria-label={
                    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
                  }
                >
                  <span>Notifications</span>
                  {unreadCount > 0 && (
                    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link href="/account" onClick={() => setOpen(false)}>
                  Account
                </Link>
              </Button>
              <LogoutButton
                variant="ghost"
                size="default"
                className="w-full"
                onDone={() => setOpen(false)}
              />
            </>
          ) : (
            <>
              <Button variant="outline" asChild className="w-full">
                <Link href="/login" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button asChild className="w-full">
                <Link href="/register" onClick={() => setOpen(false)}>
                  Create account
                </Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
