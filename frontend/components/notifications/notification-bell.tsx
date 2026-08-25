'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

import { useNotificationCount } from '@/components/notifications/notification-provider';
import { Button } from '@/components/ui/button';

/**
 * Header notification bell (F7). Links to `/notifications` and shows an unread
 * badge when `unreadCount > 0`. Rendered only for authenticated users (the header
 * gates it). The count is capped visually ("9+") and announced accessibly.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { unreadCount } = useNotificationCount();
  const hasUnread = unreadCount > 0;
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);
  const label = hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <Button variant="ghost" size="icon" asChild className={className}>
      <Link href="/notifications" aria-label={label} className="relative">
        <Bell className="size-5" aria-hidden="true" />
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground"
          >
            {badge}
          </span>
        )}
      </Link>
    </Button>
  );
}
