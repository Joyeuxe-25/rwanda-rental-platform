'use client';

import * as React from 'react';
import { CheckCheck } from 'lucide-react';

import { useAuth } from '@/components/auth/auth-provider';
import { RequireAuth } from '@/components/auth/require-auth';
import { useNotificationCount } from '@/components/notifications/notification-provider';
import { NotificationItem } from '@/components/notifications/notification-item';
import { NotificationListSkeleton } from '@/components/notifications/notification-skeletons';
import { notificationErrorMessage } from '@/components/notifications/notification-errors';
import {
  NOTIFICATION_TYPE_OPTIONS,
  notificationHref,
} from '@/components/notifications/notification-meta';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select-native';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';
import type {
  AppNotification,
  NotificationListResult,
  NotificationType,
  ReadFilter,
} from '@/types/notification';

const LIMIT = 20;
const READ_FILTERS: { value: ReadFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: NotificationListResult };

/** Notification center (F7). Authenticated (both roles); in-app notifications only. */
export function NotificationsView() {
  return (
    <RequireAuth>
      <NotificationsContent />
    </RequireAuth>
  );
}

function NotificationsContent() {
  const { user } = useAuth();
  // Destructure the STABLE (memoized) provider functions so `load` doesn't change
  // identity when the header count updates — otherwise the effect would loop.
  const {
    unreadCount: headerUnread,
    setUnreadCount,
    decrementUnread,
    clearUnread,
    refreshUnread,
  } = useNotificationCount();
  const [page, setPage] = React.useState(1);
  const [readFilter, setReadFilter] = React.useState<ReadFilter>('all');
  const [typeFilter, setTypeFilter] = React.useState<NotificationType | ''>('');
  const [state, setState] = React.useState<State>({ phase: 'loading' });
  const [markingAll, setMarkingAll] = React.useState(false);

  const anyFilter = readFilter !== 'all' || typeFilter !== '';

  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setState({ phase: 'loading' });
      try {
        const data = await listNotifications({
          page,
          limit: LIMIT,
          unread: readFilter === 'all' ? undefined : readFilter === 'unread',
          type: typeFilter || undefined,
        });
        setState({ phase: 'ready', data });
        setUnreadCount(data.unreadCount); // keep the bell authoritative
      } catch (err) {
        setState({ phase: 'error', message: notificationErrorMessage(err) });
      }
    },
    [page, readFilter, typeFilter, setUnreadCount],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  // Filter changes reset to page 1.
  function changeRead(next: ReadFilter) {
    setReadFilter(next);
    setPage(1);
  }
  function changeType(next: NotificationType | '') {
    setTypeFilter(next);
    setPage(1);
  }
  function clearFilters() {
    setReadFilter('all');
    setTypeFilter('');
    setPage(1);
  }

  // Optimistically mark one read; re-sync from the backend on failure.
  async function onMarkRead(id: string) {
    if (state.phase !== 'ready') return;
    const target = state.data.notifications.find((n) => n.id === id);
    if (!target || target.isRead) return;
    setState({
      phase: 'ready',
      data: {
        ...state.data,
        notifications: state.data.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        ),
        unreadCount: Math.max(0, state.data.unreadCount - 1),
      },
    });
    decrementUnread();
    try {
      await markNotificationRead(id);
    } catch {
      void load(true); // revert to authoritative state
      refreshUnread();
    }
  }

  async function onMarkAll() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      clearUnread();
      await load(true);
    } catch {
      void load(true);
      refreshUnread();
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = state.phase === 'ready' ? state.data.unreadCount : headerUnread;

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h1">Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={onMarkAll}
            loading={markingAll}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            Mark all as read
          </Button>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div
            className="inline-flex rounded-md border border-border p-0.5"
            role="group"
            aria-label="Filter by read state"
          >
            {READ_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={readFilter === f.value}
                onClick={() => changeRead(f.value)}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  readFilter === f.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-type">Type</Label>
            <NativeSelect
              id="notif-type"
              className="w-56"
              value={typeFilter}
              onChange={(e) => changeType(e.target.value as NotificationType | '')}
            >
              <option value="">All types</option>
              {NOTIFICATION_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="mt-6">
          {state.phase === 'loading' && <NotificationListSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'ready' &&
            (state.data.notifications.length === 0 ? (
              anyFilter ? (
                <EmptyState
                  title="No notifications match these filters"
                  description="Try a different filter, or clear them to see everything."
                  action={
                    <Button variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No notifications yet"
                  description="Activity from your rental requests, rentals, and payments will appear here."
                />
              )
            ) : (
              <>
                <ul className="space-y-3">
                  {state.data.notifications.map((n: AppNotification) => (
                    <li key={n.id}>
                      <NotificationItem
                        notification={n}
                        href={user ? notificationHref(n, user.role) : null}
                        onMarkRead={onMarkRead}
                      />
                    </li>
                  ))}
                </ul>

                <Pagination
                  page={state.data.pagination.page}
                  totalPages={state.data.pagination.totalPages}
                  onPage={setPage}
                />
              </>
            ))}
        </div>
      </Section>
    </PageContainer>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Notifications pages" className="mt-6 flex items-center justify-between gap-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        Previous
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next
      </Button>
    </nav>
  );
}
