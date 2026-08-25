import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import type { RentalStatus } from '@/types/rental';

/**
 * Presents a backend rental status via the shared StatusBadge (icon + text —
 * never color alone). The frontend only DISPLAYS backend state; the backend is
 * authoritative over transitions. Rental status is distinct from request status.
 */
const map: Record<RentalStatus, { tone: StatusTone; label: string }> = {
  ACTIVE: { tone: 'success', label: 'Active' },
  COMPLETED: { tone: 'neutral', label: 'Completed' },
  TERMINATED: { tone: 'error', label: 'Terminated' },
};

export function RentalStatusBadge({
  status,
  className,
}: {
  status: RentalStatus;
  className?: string;
}) {
  const { tone, label } = map[status] ?? map.TERMINATED;
  return <StatusBadge tone={tone} label={label} className={className} />;
}
