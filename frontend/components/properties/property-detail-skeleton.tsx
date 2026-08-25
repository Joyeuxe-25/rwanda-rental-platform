import { Skeleton } from '@/components/ui/skeleton';

/** Loading placeholder matching the property detail layout (no layout shift). */
export function PropertyDetailSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading property…</span>
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Skeleton className="aspect-[16/10] w-full rounded-lg" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <div className="space-y-2 pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </div>
  );
}
