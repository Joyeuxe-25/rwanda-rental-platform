'use client';

import * as React from 'react';

import { useAuth } from '@/components/auth/auth-provider';
import { fetchUnreadCount } from '@/lib/notifications';

interface NotificationContextValue {
  /** Authoritative unread count (from the backend, not derived from a page). */
  unreadCount: number;
  /** Re-fetch the unread count (guarded against concurrent calls). */
  refreshUnread: () => void;
  /** Set the count directly (e.g. from a list response's unreadCount). */
  setUnreadCount: (n: number) => void;
  /** Decrement by one after marking a single notification read (floors at 0). */
  decrementUnread: () => void;
  /** Reset to zero after mark-all-read or sign-out. */
  clearUnread: () => void;
}

// Safe defaults so the header degrades gracefully if rendered outside the
// provider (failure isolation — a notification problem never breaks other UI).
const NotificationContext = React.createContext<NotificationContextValue>({
  unreadCount: 0,
  refreshUnread: () => {},
  setUnreadCount: () => {},
  decrementUnread: () => {},
  clearUnread: () => {},
});

/**
 * Holds the header's unread-notification count (F7). Hydrates ONCE when the user
 * becomes authenticated and refreshes on window focus (event-driven, never a
 * polling loop). Failures are swallowed — the count simply stays as-is; the rest
 * of the app is unaffected.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [unreadCount, setUnreadCountState] = React.useState(0);
  const inFlightRef = React.useRef(false);

  const refreshUnread = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const n = await fetchUnreadCount();
      setUnreadCountState(n);
    } catch {
      // Non-blocking: keep the current count; do not surface an error here.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const setUnreadCount = React.useCallback((n: number) => setUnreadCountState(Math.max(0, n)), []);
  const decrementUnread = React.useCallback(
    () => setUnreadCountState((c) => Math.max(0, c - 1)),
    [],
  );
  const clearUnread = React.useCallback(() => setUnreadCountState(0), []);

  // Hydrate on auth; clear on sign-out.
  React.useEffect(() => {
    if (status === 'authenticated') void refreshUnread();
    else if (status === 'unauthenticated') setUnreadCountState(0);
  }, [status, refreshUnread]);

  // Refresh when the tab regains focus (bounded, event-driven — not polling).
  React.useEffect(() => {
    if (status !== 'authenticated') return;
    const onFocus = () => void refreshUnread();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [status, refreshUnread]);

  const value = React.useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      refreshUnread: () => void refreshUnread(),
      setUnreadCount,
      decrementUnread,
      clearUnread,
    }),
    [unreadCount, refreshUnread, setUnreadCount, decrementUnread, clearUnread],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

/** Access the unread-count context. Returns safe defaults outside the provider. */
export function useNotificationCount(): NotificationContextValue {
  return React.useContext(NotificationContext);
}
