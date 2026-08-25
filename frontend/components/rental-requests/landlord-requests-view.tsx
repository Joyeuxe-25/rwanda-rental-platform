'use client';

import * as React from 'react';

import { RequireRole } from '@/components/auth/require-role';
import { LandlordRequestCard } from '@/components/rental-requests/landlord-request-card';
import { RequestListSkeleton } from '@/components/rental-requests/request-list-skeleton';
import { rentalRequestErrorMessage } from '@/components/rental-requests/rental-request-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { listLandlordRentalRequests } from '@/lib/rental-requests';
import type { LandlordRentalRequest } from '@/types/rental-request';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; requests: LandlordRentalRequest[] };

/** Rental requests for the landlord's own properties (F4). Landlord-only. */
export function LandlordRequestsView() {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Rental requests is available to landlords">
      <LandlordRequestsContent />
    </RequireRole>
  );
}

function LandlordRequestsContent() {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const requests = await listLandlordRentalRequests();
      setState({ phase: 'ready', requests });
    } catch (err) {
      setState({ phase: 'error', message: rentalRequestErrorMessage(err, 'list') });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <h1 className="text-h1">Rental requests</h1>

        <div className="mt-6">
          {state.phase === 'loading' && <RequestListSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'ready' &&
            (state.requests.length === 0 ? (
              <EmptyState
                title="No rental requests yet"
                description="When a tenant requests to rent one of your properties, it will appear here for you to review."
              />
            ) : (
              <ul className="space-y-3">
                {state.requests.map((request) => (
                  <li key={request.id}>
                    <LandlordRequestCard request={request} />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Section>
    </PageContainer>
  );
}
