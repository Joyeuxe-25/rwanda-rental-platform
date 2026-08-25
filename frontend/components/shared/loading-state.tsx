import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Full-region loading placeholder used while a route or data resolves. */
export function LoadingState({
  className,
  label = 'Loading…',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn('space-y-4', className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-1/3" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

/** Skeleton shaped like a future content/property card. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

/** A block of text lines. */
export function TextSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-1/2' : 'w-full')} />
      ))}
    </div>
  );
}

/** Circular avatar placeholder. */
export function AvatarSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('size-10 rounded-full', className)} />;
}
