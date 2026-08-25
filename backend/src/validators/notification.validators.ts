import { z } from 'zod';

/**
 * Notification query validators (B12). Pagination is bounded; `type` must be a
 * known notification type; `unread` is a strict boolean flag. `userId` is NEVER
 * accepted from the client — ownership comes from the session.
 */
export const NOTIFICATION_TYPES = [
  'RENTAL_REQUEST_SUBMITTED',
  'NEW_RENTAL_REQUEST',
  'RENTAL_REQUEST_ACCEPTED',
  'RENTAL_REQUEST_REJECTED',
  'RENTAL_REQUEST_CANCELLED',
  'RENTAL_ACTIVATED',
  'RENTAL_COMPLETED',
  'RENTAL_TERMINATED',
  'PAYMENT_INITIATED',
  'PAYMENT_SUCCESSFUL',
  'PAYMENT_RECEIVED',
  'PAYMENT_FAILED',
  'RENT_REMINDER',
] as const;

// Unknown query params (e.g. a spoofed `userId`) are STRIPPED and ignored —
// ownership always comes from the session, never the query — while invalid
// page/limit/type values are still rejected (422).
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int('Invalid page').min(1, 'Invalid page').default(1),
  limit: z.coerce.number().int('Invalid limit').min(1).max(100).default(20),
  unread: z.enum(['true', 'false']).optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
