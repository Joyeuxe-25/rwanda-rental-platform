'use client';

import * as React from 'react';
import Link from 'next/link';
import { UserRound } from 'lucide-react';

import { RequireRole } from '@/components/auth/require-role';
import { LandlordDecisionControls } from '@/components/rental-requests/landlord-decision-controls';
import { RentalRequestStatusBadge } from '@/components/rental-requests/rental-request-status-badge';
import { RequestSummaryProperty } from '@/components/rental-requests/request-summary-property';
import { RequestTimeline } from '@/components/rental-requests/request-timeline';
import { RequestDetailSkeleton } from '@/components/rental-requests/request-list-skeleton';
import { rentalRequestErrorMessage } from '@/components/rental-requests/rental-request-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api';
import { getLandlordRentalRequest } from '@/lib/rental-requests';
import { formatDate } from '@/lib/format';
import type { LandlordRentalRequest } from '@/types/rental-request';

type State =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; request: LandlordRentalRequest };

/** Landlord request detail (F4). Landlord-only; approve/reject a PENDING request. */
export function LandlordRequestDetailView({ id }: { id: string }) {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Rental requests is available to landlords">
      <LandlordRequestDetailContent id={id} />
    </RequireRole>
  );
}

function LandlordRequestDetailContent({ id }: { id: string }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });
  const [notice, setNotice] = React.useState<string | null>(null);

  // `silent` re-fetches without flipping to the loading phase, so the inline
  // decision controls (which may be showing a conflict message) stay mounted.
  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setState({ phase: 'loading' });
      try {
        const request = await getLandlordRentalRequest(id);
        setState({ phase: 'ready', request });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          setState({ phase: 'not-found' });
          return;
        }
        setState({ phase: 'error', message: rentalRequestErrorMessage(err, 'detail') });
      }
    },
    [id],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const onUpdated = React.useCallback(
    (updated: LandlordRentalRequest, action: 'approve' | 'reject') => {
      setState({ phase: 'ready', request: updated });
      setNotice(
        action === 'approve'
          ? 'The rental request was accepted. No rental or payment has been created yet.'
          : 'The rental request was rejected.',
      );
    },
    [],
  );

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[
            { label: 'Rental requests', href: '/landlord/requests' },
            { label: 'Request details' },
          ]}
        />

        <div className="mt-6">
          {state.phase === 'loading' && <RequestDetailSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'not-found' && (
            <EmptyState
              title="Request not found"
              description="This rental request doesn’t exist or isn’t for one of your properties."
              action={
                <Button asChild>
                  <Link href="/landlord/requests">Back to rental requests</Link>
                </Button>
              }
            />
          )}

          {state.phase === 'ready' && (
            <div className="space-y-6">
              {notice && (
                <Alert variant="success">
                  <AlertTitle>Done</AlertTitle>
                  <AlertDescription>{notice}</AlertDescription>
                </Alert>
              )}

              <RequestSummaryProperty property={state.request.property} />

              <Card>
                <CardHeader>
                  <CardTitle className="text-h4">Tenant</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                    {state.request.tenant.firstName} {state.request.tenant.lastName}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-h4">Request status</CardTitle>
                  <RentalRequestStatusBadge status={state.request.status} />
                </CardHeader>
                <CardContent className="space-y-6">
                  <RequestTimeline status={state.request.status} />

                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Submitted</dt>
                      <dd className="text-sm font-medium text-foreground">
                        {formatDate(state.request.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Last updated</dt>
                      <dd className="text-sm font-medium text-foreground">
                        {formatDate(state.request.updatedAt)}
                      </dd>
                    </div>
                  </dl>

                  {state.request.message && (
                    <div>
                      <h3 className="text-sm font-medium text-foreground">Message from tenant</h3>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {state.request.message}
                      </p>
                    </div>
                  )}

                  {state.request.status === 'PENDING' && (
                    <div className="border-t border-border pt-4">
                      <LandlordDecisionControls
                        requestId={state.request.id}
                        onUpdated={onUpdated}
                        onConflict={() => void load(true)}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </Section>
    </PageContainer>
  );
}
