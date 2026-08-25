import { Skeleton } from '@/components/ui/skeleton';

/** List skeleton for the tenant/landlord request lists (F4). */
export function RequestListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <li className="sr-only">Loading requests…</li>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Detail skeleton for a single request page (F4). */
export function RequestDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading request…</span>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  );
}
