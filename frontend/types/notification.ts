/**
 * Notification view types, mapped explicitly from the approved backend B12
 * contract (`backend/openapi.json` + the notification service `toSafeNotification`).
 * Only SAFE serialized fields are modeled — the backend never exposes `userId`,
 * `eventKey`, raw payloads, or provider data, so the frontend never types them.
 */

/** The 13 backend notification types (B12 enum). */
export type NotificationType =
  | 'RENTAL_REQUEST_SUBMITTED'
  | 'NEW_RENTAL_REQUEST'
  | 'RENTAL_REQUEST_ACCEPTED'
  | 'RENTAL_REQUEST_REJECTED'
  | 'RENTAL_REQUEST_CANCELLED'
  | 'RENTAL_ACTIVATED'
  | 'RENTAL_COMPLETED'
  | 'RENTAL_TERMINATED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_SUCCESSFUL'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'RENT_REMINDER';

/** The entity a notification may point at (used only for internal deep links). */
export type RelatedEntityType = 'PROPERTY' | 'RENTAL_REQUEST' | 'RENTAL' | 'PAYMENT';

/** Safe, client-facing notification (no userId/eventKey/internal fields). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType: RelatedEntityType | null;
  relatedEntityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

/** Pagination block from the notification list (B12). */
export interface NotificationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** The full `GET /notifications` response envelope data. */
export interface NotificationListResult {
  notifications: AppNotification[];
  /** Authoritative total unread count (NOT derived from the current page). */
  unreadCount: number;
  pagination: NotificationPagination;
}

/** Read-state filter for the list. `undefined` = all. */
export type ReadFilter = 'all' | 'unread' | 'read';

/** Query params accepted by the B12 list endpoint. */
export interface NotificationListParams {
  page?: number;
  limit?: number;
  unread?: boolean;
  type?: NotificationType;
}
