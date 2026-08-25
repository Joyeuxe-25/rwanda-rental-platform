import { api } from '@/lib/api';
import type {
  AppNotification,
  NotificationListParams,
  NotificationListResult,
} from '@/types/notification';

/**
 * Notification data access (F7). Reuses the F0 API client (cookie-credentialed,
 * envelope-aware) — NO second HTTP client, NO JWT/Bearer, NO token storage, and
 * NO external notification provider (email/SMS/push) calls. Notifications are
 * private, so reads use `no-store` — never publicly cached.
 *
 * Integrates the approved B12 endpoints under `/api/v1/notifications`.
 */

/** Serialize params to the documented B12 query string (drops empties). */
function toQuery(params: NotificationListParams): string {
  const usp = new URLSearchParams();
  if (params.page) usp.set('page', String(params.page));
  if (params.limit) usp.set('limit', String(params.limit));
  if (params.unread !== undefined) usp.set('unread', params.unread ? 'true' : 'false');
  if (params.type) usp.set('type', params.type);
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** GET /notifications → list + authoritative unreadCount + pagination. */
export function listNotifications(
  params: NotificationListParams = {},
): Promise<NotificationListResult> {
  return api.get<NotificationListResult>(`/notifications${toQuery(params)}`, { cache: 'no-store' });
}

/**
 * Fetch just the authoritative unread count (cheap: one row). Used to hydrate the
 * header badge without loading a full page of notifications.
 */
export async function fetchUnreadCount(): Promise<number> {
  const data = await listNotifications({ page: 1, limit: 1 });
  return data.unreadCount;
}

/** GET /notifications/:id → one notification. */
export async function getNotification(id: string): Promise<AppNotification> {
  const data = await api.get<{ notification: AppNotification }>(
    `/notifications/${encodeURIComponent(id)}`,
    { cache: 'no-store' },
  );
  return data.notification;
}

/** PATCH /notifications/:id/read → the notification, now read (idempotent). */
export async function markNotificationRead(id: string): Promise<AppNotification> {
  const data = await api.patch<{ notification: AppNotification }>(
    `/notifications/${encodeURIComponent(id)}/read`,
  );
  return data.notification;
}

/** PATCH /notifications/read-all → { updated } (count of rows marked read). */
export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return api.patch<{ updated: number }>('/notifications/read-all');
}
