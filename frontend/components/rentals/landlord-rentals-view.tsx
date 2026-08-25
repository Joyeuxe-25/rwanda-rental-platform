'use client';

import * as React from 'react';
import Link from 'next/link';

import { RequireRole } from '@/components/auth/require-role';
import { LandlordRentalCard } from '@/components/rentals/landlord-rental-card';
import { RentalListSkeleton } from '@/components/rentals/rental-skeletons';
import { rentalErrorMessage } from '@/components/rentals/rental-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { listLandlordRentals } from '@/lib/rentals';
import type { LandlordRental } from '@/types/rental';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; rentals: LandlordRental[] };

/** Rentals on the landlord's own properties (F5). Landlord-only. */
export function LandlordRentalsView() {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Rentals is available to landlords">
      <LandlordRentalsContent />
    </RequireRole>
  );
}

function LandlordRentalsContent() {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const rentals = await listLandlordRentals();
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
        <h1 className="text-h1">Rentals</h1>

        <div className="mt-6">
          {state.phase === 'loading' && <RentalListSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'ready' &&
            (state.rentals.length === 0 ? (
              <EmptyState
                title="No active or past rentals yet"
                description="When you accept a request and the tenant starts the rental, it will appear here."
                action={
                  <Button asChild variant="outline">
                    <Link href="/landlord/requests">View rental requests</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {state.rentals.map((rental) => (
                  <li key={rental.id}>
                    <LandlordRentalCard rental={rental} />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Section>
    </PageContainer>
  );
}
