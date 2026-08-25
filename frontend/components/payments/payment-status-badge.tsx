import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import type { PaymentStatus } from '@/types/payment';

/**
 * Presents a backend payment status via the shared StatusBadge (icon + text —
 * never color alone). The frontend only DISPLAYS backend state; there is NO
 * client status-mutation endpoint. PENDING is real — success is never assumed.
 */
const map: Record<PaymentStatus, { tone: StatusTone; label: string }> = {
  PENDING: { tone: 'pending', label: 'Pending' },
  SUCCESSFUL: { tone: 'success', label: 'Successful' },
  FAILED: { tone: 'error', label: 'Failed' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
  EXPIRED: { tone: 'warning', label: 'Expired' },
};

/** Longer, human status line for detail pages. */
export const PAYMENT_STATUS_TEXT: Record<PaymentStatus, string> = {
  PENDING: 'Waiting for confirmation',
  SUCCESSFUL: 'Payment successful',
  FAILED: 'Payment failed',
  CANCELLED: 'Payment cancelled',
  EXPIRED: 'Payment expired',
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  const { tone, label } = map[status] ?? map.PENDING;
  return <StatusBadge tone={tone} label={label} className={className} />;
}
