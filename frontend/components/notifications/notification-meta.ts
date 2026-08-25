import {
  FileText,
  Inbox,
  CheckCircle2,
  XCircle,
  Ban,
  KeyRound,
  Flag,
  CreditCard,
  Wallet,
  Bell,
  type LucideIcon,
} from 'lucide-react';

import type { AppNotification, NotificationType } from '@/types/notification';
import type { UserRole } from '@/types/auth';

/**
 * Presentation metadata for each B12 notification type (F7): a user-friendly
 * label, a coherent icon, and an accent color class. Meaning is ALWAYS carried by
 * icon + text, never color alone. `PAYMENT_INITIATED` and `PAYMENT_SUCCESSFUL`
 * are deliberately distinct — an initiated payment is never shown as successful.
 */
interface TypeMeta {
  label: string;
  Icon: LucideIcon;
  /** Tailwind text-color class for the icon (paired with text, not the only cue). */
  color: string;
}

export const NOTIFICATION_META: Record<NotificationType, TypeMeta> = {
  RENTAL_REQUEST_SUBMITTED: { label: 'Rental request sent', Icon: FileText, color: 'text-primary' },
  NEW_RENTAL_REQUEST: { label: 'New rental request', Icon: Inbox, color: 'text-primary' },
  RENTAL_REQUEST_ACCEPTED: {
    label: 'Rental request accepted',
    Icon: CheckCircle2,
    color: 'text-success',
  },
  RENTAL_REQUEST_REJECTED: {
    label: 'Rental request rejected',
    Icon: XCircle,
    color: 'text-destructive',
  },
  RENTAL_REQUEST_CANCELLED: {
    label: 'Rental request cancelled',
    Icon: Ban,
    color: 'text-muted-foreground',
  },
  RENTAL_ACTIVATED: { label: 'Rental activated', Icon: KeyRound, color: 'text-success' },
  RENTAL_COMPLETED: { label: 'Rental completed', Icon: Flag, color: 'text-success' },
  RENTAL_TERMINATED: { label: 'Rental terminated', Icon: Ban, color: 'text-muted-foreground' },
  PAYMENT_INITIATED: { label: 'Payment initiated', Icon: CreditCard, color: 'text-foreground' },
  PAYMENT_SUCCESSFUL: { label: 'Payment successful', Icon: CheckCircle2, color: 'text-success' },
  PAYMENT_RECEIVED: { label: 'Payment received', Icon: Wallet, color: 'text-success' },
  PAYMENT_FAILED: { label: 'Payment failed', Icon: XCircle, color: 'text-destructive' },
  RENT_REMINDER: { label: 'Rent reminder', Icon: Bell, color: 'text-warning' },
};

/** The notification types offered in the type filter (label + value). */
export const NOTIFICATION_TYPE_OPTIONS: { value: NotificationType; label: string }[] = (
  Object.keys(NOTIFICATION_META) as NotificationType[]
).map((value) => ({ value, label: NOTIFICATION_META[value].label }));

/**
 * The internal deep link for a notification's related entity, chosen by the
 * CURRENT user's role (never inferred from the notification). Returns `null` when
 * there is no related entity or the type is unknown — the item is then not a link.
 * The backend still enforces authorization when the link is opened.
 */
export function notificationHref(n: AppNotification, role: UserRole): string | null {
  const id = n.relatedEntityId;
  if (!id || !n.relatedEntityType) return null;
  const isLandlord = role === 'LANDLORD';
  switch (n.relatedEntityType) {
    case 'PROPERTY':
      return `/properties/${id}`;
    case 'RENTAL_REQUEST':
      return isLandlord ? `/landlord/requests/${id}` : `/requests/${id}`;
    case 'RENTAL':
      return isLandlord ? `/landlord/rentals/${id}` : `/rentals/${id}`;
    case 'PAYMENT':
      return isLandlord ? `/landlord/payments/${id}` : `/payments/${id}`;
    default:
      return null;
  }
}
