import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Loading placeholder for the My Properties list (F11). */
export function ManagedPropertyListSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Card>
            <CardContent className="flex gap-4 p-4">
              <Skeleton className="h-20 w-28 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** Loading placeholder for the management detail view (F11). */
export function ManagedPropertyDetailSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="aspect-[16/9] w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
