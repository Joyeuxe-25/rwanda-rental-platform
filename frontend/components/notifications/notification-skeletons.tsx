import { Skeleton } from '@/components/ui/skeleton';

/** List skeleton for the notification center (F7). */
export function NotificationListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <li className="sr-only">Loading notifications…</li>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex gap-3 rounded-lg border border-border bg-card p-4">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}
