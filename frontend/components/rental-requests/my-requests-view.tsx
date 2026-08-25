'use client';

import * as React from 'react';
import Link from 'next/link';

import { RequireRole } from '@/components/auth/require-role';
import { RequestListSkeleton } from '@/components/rental-requests/request-list-skeleton';
import { TenantRequestCard } from '@/components/rental-requests/tenant-request-card';
import { rentalRequestErrorMessage } from '@/components/rental-requests/rental-request-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { listMyRentalRequests } from '@/lib/rental-requests';
import type { TenantRentalRequest } from '@/types/rental-request';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; requests: TenantRentalRequest[] };

/** Tenant's own rental requests (F4). Tenant-only; the backend returns only the
 * authenticated tenant's requests (no client-side ownership filtering needed). */
export function MyRequestsView() {
  return (
    <RequireRole role="TENANT" forbiddenTitle="My requests is available to tenants">
      <MyRequestsContent />
    </RequireRole>
  );
}

function MyRequestsContent() {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const requests = await listMyRentalRequests();
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
        <h1 className="text-h1">My requests</h1>

        <div className="mt-6">
          {state.phase === 'loading' && <RequestListSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'ready' &&
            (state.requests.length === 0 ? (
              <EmptyState
                title="No rental requests yet"
                description="When you request to rent a property, it will appear here so you can track its status."
                action={
                  <Button asChild>
                    <Link href="/properties">Browse properties</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {state.requests.map((request) => (
                  <li key={request.id}>
                    <TenantRequestCard request={request} />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Section>
    </PageContainer>
  );
}
