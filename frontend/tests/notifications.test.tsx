import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth')>();
  return { ...actual, fetchCurrentUser: vi.fn(), logoutRequest: vi.fn() };
});
vi.mock('@/lib/notifications', () => ({
  listNotifications: vi.fn(),
  getNotification: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  fetchUnreadCount: vi.fn(),
}));

import * as authApi from '@/lib/auth';
import * as notifApi from '@/lib/notifications';
import { AuthProvider } from '@/components/auth/auth-provider';
import { NotificationProvider } from '@/components/notifications/notification-provider';
import { NotificationsView } from '@/components/notifications/notifications-view';
import { AuthNav } from '@/components/auth/auth-nav';
import { MobileNav } from '@/components/layout/mobile-nav';
import { notificationHref, NOTIFICATION_META } from '@/components/notifications/notification-meta';
import { formatRelativeTime } from '@/lib/format';
import type { AuthUser } from '@/types/auth';
import type {
  AppNotification,
  NotificationListResult,
  NotificationType,
} from '@/types/notification';

const tenant: AuthUser = {
  id: 't1',
  role: 'TENANT',
  firstName: 'Jean',
  lastName: 'Uwimana',
  email: 'jean@example.rw',
  phone: '+250788123456',
  profileImageKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
// NB: the title is deliberately NOT one of the type-filter option labels, so
// `findByText(title)` matches the item — never the always-rendered <option>.
const notif = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1',
  type: 'RENTAL_REQUEST_ACCEPTED',
  title: 'You have new activity',
  message: 'Your rental request for "Sunny Apartment" was accepted.',
  relatedEntityType: 'RENTAL_REQUEST',
  relatedEntityId: 'req-1',
  isRead: false,
  readAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const listResult = (over: Partial<NotificationListResult> = {}): NotificationListResult => ({
  notifications: [notif()],
  unreadCount: 1,
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  ...over,
});

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
  vi.mocked(notifApi.fetchUnreadCount).mockResolvedValue(0);
  vi.mocked(notifApi.listNotifications).mockResolvedValue(listResult());
});
afterEach(() => vi.clearAllMocks());

const renderApp = (ui: React.ReactNode) =>
  render(
    <AuthProvider>
      <NotificationProvider>{ui}</NotificationProvider>
    </AuthProvider>,
  );

function lastListCall() {
  const calls = vi.mocked(notifApi.listNotifications).mock.calls;
  return calls[calls.length - 1]![0];
}

// ============================================================================
// Pure helpers
// ============================================================================
describe('notification helpers', () => {
  it('maps role-aware related links for every entity type', () => {
    const t = 'TENANT' as const;
    const l = 'LANDLORD' as const;
    expect(
      notificationHref(notif({ relatedEntityType: 'PROPERTY', relatedEntityId: 'p1' }), t),
    ).toBe('/properties/p1');
    expect(
      notificationHref(notif({ relatedEntityType: 'RENTAL_REQUEST', relatedEntityId: 'r1' }), t),
    ).toBe('/requests/r1');
    expect(
      notificationHref(notif({ relatedEntityType: 'RENTAL_REQUEST', relatedEntityId: 'r1' }), l),
    ).toBe('/landlord/requests/r1');
    expect(notificationHref(notif({ relatedEntityType: 'RENTAL', relatedEntityId: 'x1' }), t)).toBe(
      '/rentals/x1',
    );
    expect(notificationHref(notif({ relatedEntityType: 'RENTAL', relatedEntityId: 'x1' }), l)).toBe(
      '/landlord/rentals/x1',
    );
    expect(
      notificationHref(notif({ relatedEntityType: 'PAYMENT', relatedEntityId: 'y1' }), t),
    ).toBe('/payments/y1');
    expect(
      notificationHref(notif({ relatedEntityType: 'PAYMENT', relatedEntityId: 'y1' }), l),
    ).toBe('/landlord/payments/y1');
  });

  it('returns null for missing or unknown related entities', () => {
    expect(notificationHref(notif({ relatedEntityId: null }), 'TENANT')).toBeNull();
    expect(
      notificationHref(
        notif({ relatedEntityType: 'UNKNOWN' as never, relatedEntityId: 'z' }),
        'TENANT',
      ),
    ).toBeNull();
  });

  it('never labels an initiated payment as successful', () => {
    expect(NOTIFICATION_META.PAYMENT_INITIATED.label).toBe('Payment initiated');
    expect(NOTIFICATION_META.PAYMENT_SUCCESSFUL.label).toBe('Payment successful');
    expect(NOTIFICATION_META.PAYMENT_INITIATED.label).not.toMatch(/successful/i);
  });

  it('formats timestamps safely (valid + invalid)', () => {
    expect(formatRelativeTime(new Date().toISOString())).toMatch(/just now|min ago/);
    expect(formatRelativeTime('not-a-date')).toBe('—');
    expect(formatRelativeTime(null)).toBe('—');
  });
});

// ============================================================================
// Header bell / mobile entry
// ============================================================================
describe('notification navigation entry', () => {
  it('does not show a personalized notification entry when anonymous', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);
    renderApp(<AuthNav />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /notifications/i })).toBeNull();
    expect(notifApi.fetchUnreadCount).not.toHaveBeenCalled();
  });

  it('shows the bell with an unread badge when authenticated', async () => {
    vi.mocked(notifApi.fetchUnreadCount).mockResolvedValue(3);
    renderApp(<AuthNav />);
    const bell = await screen.findByRole('link', { name: /notifications, 3 unread/i });
    expect(bell).toHaveAttribute('href', '/notifications');
    expect(within(bell).getByText('3')).toBeInTheDocument();
  });

  it('mobile menu includes a Notifications link', async () => {
    vi.mocked(notifApi.fetchUnreadCount).mockResolvedValue(0);
    renderApp(<MobileNav />);
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /notifications/i })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });
});

// ============================================================================
// Notification center
// ============================================================================
describe('notification center', () => {
  it('loads the list and renders items with the backend unread count', async () => {
    renderApp(<NotificationsView />);
    expect(await screen.findByText('You have new activity')).toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeInTheDocument();
  });

  it('shows a non-color unread cue on unread items and none on read items', async () => {
    vi.mocked(notifApi.listNotifications).mockResolvedValue(
      listResult({
        notifications: [
          notif({ id: 'a', isRead: false }),
          notif({ id: 'b', isRead: true, title: 'An older read item' }),
        ],
      }),
    );
    renderApp(<NotificationsView />);
    await screen.findByText('You have new activity');
    // The unread item exposes a "Mark as read" affordance; the read one does not.
    expect(screen.getAllByRole('button', { name: /mark as read/i })).toHaveLength(1);
  });

  it('marks one as read (PATCH), updates locally, and decrements the count', async () => {
    vi.mocked(notifApi.markNotificationRead).mockResolvedValue(notif({ isRead: true }));
    renderApp(<NotificationsView />);
    fireEvent.click(await screen.findByRole('button', { name: /mark as read/i }));
    await waitFor(() => expect(notifApi.markNotificationRead).toHaveBeenCalledWith('n1'));
    // The item becomes read: its "Mark as read" affordance disappears.
    await waitFor(() => expect(screen.queryByRole('button', { name: /mark as read/i })).toBeNull());
    expect(screen.getByText('All caught up')).toBeInTheDocument();
  });

  it('marks all as read (PATCH) and reaches zero unread', async () => {
    vi.mocked(notifApi.listNotifications)
      .mockResolvedValueOnce(listResult())
      .mockResolvedValue(listResult({ notifications: [notif({ isRead: true })], unreadCount: 0 }));
    vi.mocked(notifApi.markAllNotificationsRead).mockResolvedValue({ updated: 1 });
    renderApp(<NotificationsView />);
    await screen.findByText('You have new activity'); // list loaded → button enabled
    fireEvent.click(screen.getByRole('button', { name: /mark all as read/i }));
    await waitFor(() => expect(notifApi.markAllNotificationsRead).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mark all as read/i })).toBeDisabled(),
    );
  });

  it('applies the unread filter at the API level', async () => {
    renderApp(<NotificationsView />);
    await screen.findByText('You have new activity');
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() =>
      expect(lastListCall()).toEqual(expect.objectContaining({ unread: true, page: 1 })),
    );
  });

  it('applies the type filter with the exact backend enum value', async () => {
    renderApp(<NotificationsView />);
    await screen.findByText('You have new activity');
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'PAYMENT_SUCCESSFUL' satisfies NotificationType },
    });
    await waitFor(() =>
      expect(lastListCall()).toEqual(
        expect.objectContaining({ type: 'PAYMENT_SUCCESSFUL', page: 1 }),
      ),
    );
  });

  it('paginates and preserves the active filter', async () => {
    vi.mocked(notifApi.listNotifications).mockResolvedValue(
      listResult({ pagination: { page: 1, limit: 20, total: 40, totalPages: 2 } }),
    );
    renderApp(<NotificationsView />);
    await screen.findByText('You have new activity');
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() =>
      expect(lastListCall()).toEqual(expect.objectContaining({ unread: true, page: 1 })),
    );
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() =>
      expect(lastListCall()).toEqual(expect.objectContaining({ unread: true, page: 2 })),
    );
  });

  it('renders the empty state when there are no notifications', async () => {
    vi.mocked(notifApi.listNotifications).mockResolvedValue(
      listResult({
        notifications: [],
        unreadCount: 0,
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      }),
    );
    renderApp(<NotificationsView />);
    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument();
  });

  it('renders a filtered empty state with a clear-filters action', async () => {
    vi.mocked(notifApi.listNotifications)
      .mockResolvedValueOnce(listResult())
      .mockResolvedValue(
        listResult({
          notifications: [],
          unreadCount: 1,
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        }),
      );
    renderApp(<NotificationsView />);
    await screen.findByText('You have new activity');
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(await screen.findByText(/no notifications match these filters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('renders a safe error state on failure', async () => {
    vi.mocked(notifApi.listNotifications).mockRejectedValue(new Error('boom'));
    renderApp(<NotificationsView />);
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('does not poll — loads once on open', async () => {
    renderApp(<NotificationsView />);
    await screen.findByText('You have new activity');
    await new Promise((r) => setTimeout(r, 150));
    expect(vi.mocked(notifApi.listNotifications).mock.calls.length).toBe(1);
  });
});
