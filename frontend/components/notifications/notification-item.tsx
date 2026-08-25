'use client';

import * as React from 'react';
import Link from 'next/link';

import { NOTIFICATION_META } from '@/components/notifications/notification-meta';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/types/notification';

/**
 * One notification (F7). Unread items carry stronger visual weight AND a
 * non-color cue (a dot + an "Unread" pill/sr-text); read items are subdued.
 * Interactive elements are siblings (title link + mark-read button), never
 * nested. Opening an unread notification via its link also marks it read.
 */
export function NotificationItem({
  notification,
  href,
  onMarkRead,
}: {
  notification: AppNotification;
  href: string | null;
  onMarkRead: (id: string) => void;
}) {
  const meta = NOTIFICATION_META[notification.type];
  const Icon = meta?.Icon;
  const unread = !notification.isRead;

  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border p-4 transition-colors',
        unread ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full bg-muted',
          meta?.color ?? 'text-foreground',
        )}
      >
        {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('font-medium', unread ? 'text-foreground' : 'text-muted-foreground')}>
            {href ? (
              <Link
                href={href}
                onClick={() => unread && onMarkRead(notification.id)}
                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {notification.title}
              </Link>
            ) : (
              notification.title
            )}
          </h3>
          {unread && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Unread
            </span>
          )}
        </div>

        <p className={cn('text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>
          {notification.message}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-0.5">
          <time dateTime={notification.createdAt} className="text-xs text-muted-foreground">
            {formatRelativeTime(notification.createdAt)}
          </time>
          {unread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={() => onMarkRead(notification.id)}
            >
              Mark as read
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
