import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import type { RentalRequestStatus } from '@/types/rental-request';

/**
 * Presents a backend rental-request status via the shared StatusBadge (icon +
 * text — never color alone). The frontend only DISPLAYS backend state; the
 * backend remains authoritative over transitions.
 */
const map: Record<RentalRequestStatus, { tone: StatusTone; label: string }> = {
  PENDING: { tone: 'pending', label: 'Pending' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  REJECTED: { tone: 'error', label: 'Rejected' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};

export function RentalRequestStatusBadge({
  status,
  className,
}: {
  status: RentalRequestStatus;
  className?: string;
}) {
  const { tone, label } = map[status] ?? map.CANCELLED;
  return <StatusBadge tone={tone} label={label} className={className} />;
}
