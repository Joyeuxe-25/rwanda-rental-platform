import { StatusBadge } from '@/components/ui/status-badge';

/**
 * Publication state badge (F11) — landlord-controlled. This is DISTINCT from the
 * availability status (AVAILABLE/OCCUPIED/UNAVAILABLE), which the backend owns
 * and is shown separately via `PropertyStatusBadge`. Publication only reflects
 * whether the listing appears in the public marketplace.
 */
export function PublicationBadge({
  isPublished,
  className,
}: {
  isPublished: boolean;
  className?: string;
}) {
  return isPublished ? (
    <StatusBadge tone="info" label="Published" className={className} />
  ) : (
    <StatusBadge tone="neutral" label="Draft" className={className} />
  );
}
