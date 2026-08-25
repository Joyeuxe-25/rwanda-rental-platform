'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

/** Clears all marketplace filters (navigates to `/properties`). */
export function ClearFiltersButton({ label = 'Clear filters' }: { label?: string }) {
  const router = useRouter();
  return (
    <Button size="sm" variant="outline" onClick={() => router.push('/properties')}>
      {label}
    </Button>
  );
}
