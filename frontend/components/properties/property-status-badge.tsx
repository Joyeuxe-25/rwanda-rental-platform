import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import type { PropertyStatus } from '@/types/property';

const map: Record<PropertyStatus, { tone: StatusTone; label: string }> = {
  AVAILABLE: { tone: 'success', label: 'Available' },
  OCCUPIED: { tone: 'neutral', label: 'Occupied' },
  UNAVAILABLE: { tone: 'neutral', label: 'Unavailable' },
};

/**
 * Presents a backend property status via the F1 StatusBadge (icon + text, never
 * color alone). The frontend only DISPLAYS backend state; it is not authoritative.
 */
export function PropertyStatusBadge({
  status,
  className,
}: {
  status: PropertyStatus;
  className?: string;
}) {
  const { tone, label } = map[status] ?? map.UNAVAILABLE;
  return <StatusBadge tone={tone} label={label} className={className} />;
}

/** Whether a status should visually present as requestable (AVAILABLE only). */
export function isRequestable(status: PropertyStatus): boolean {
  return status === 'AVAILABLE';
}
