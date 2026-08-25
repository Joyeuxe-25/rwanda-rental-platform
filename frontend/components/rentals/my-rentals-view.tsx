'use client';

import * as React from 'react';
import Link from 'next/link';

import { RequireRole } from '@/components/auth/require-role';
import { RentalListSkeleton } from '@/components/rentals/rental-skeletons';
import { TenantRentalCard } from '@/components/rentals/tenant-rental-card';
import { rentalErrorMessage } from '@/components/rentals/rental-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { listMyRentals } from '@/lib/rentals';
import type { TenantRental } from '@/types/rental';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; rentals: TenantRental[] };

/** A tenant's rentals (F5). Tenant-only; the backend returns only the
 * authenticated tenant's rentals (no client-side ownership filtering). */
export function MyRentalsView() {
  return (
    <RequireRole role="TENANT" forbiddenTitle="My rentals is available to tenants">
      <MyRentalsContent />
    </RequireRole>
  );
}

function MyRentalsContent() {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const rentals = await listMyRentals();
      setState({ phase: 'ready', rentals });
    } catch (err) {
      setState({ phase: 'error', message: rentalErrorMessage(err, 'list') });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <h1 className="text-h1">My rentals</h1>

        <div className="mt-6">
          {state.phase === 'loading' && <RentalListSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'ready' &&
            (state.rentals.length === 0 ? (
              <EmptyState
                title="No rentals yet"
                description="When you start a rental from an accepted request, it will appear here."
                action={
                  <Button asChild>
                    <Link href="/properties">Browse properties</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {state.rentals.map((rental) => (
                  <li key={rental.id}>
                    <TenantRentalCard rental={rental} />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Section>
    </PageContainer>
  );
}
