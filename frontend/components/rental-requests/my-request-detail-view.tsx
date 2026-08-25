'use client';

import * as React from 'react';
import Link from 'next/link';

import { RequireRole } from '@/components/auth/require-role';
import { CancelRequestDialog } from '@/components/rental-requests/cancel-request-dialog';
import { RentalRequestStatusBadge } from '@/components/rental-requests/rental-request-status-badge';
import { RequestSummaryProperty } from '@/components/rental-requests/request-summary-property';
import { RequestTimeline } from '@/components/rental-requests/request-timeline';
import { RequestDetailSkeleton } from '@/components/rental-requests/request-list-skeleton';
import { rentalRequestErrorMessage } from '@/components/rental-requests/rental-request-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api';
import { getMyRentalRequest } from '@/lib/rental-requests';
import { formatDate } from '@/lib/format';
import type { TenantRentalRequest } from '@/types/rental-request';

type State =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; request: TenantRentalRequest };

/** Tenant request detail (F4). Tenant-only; only PENDING requests can be cancelled. */
export function MyRequestDetailView({ id }: { id: string }) {
  return (
    <RequireRole role="TENANT" forbiddenTitle="My requests is available to tenants">
      <MyRequestDetailContent id={id} />
    </RequireRole>
  );
}

function MyRequestDetailContent({ id }: { id: string }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  // `silent` re-fetches without flipping to the loading phase, so an open dialog
  // (e.g. the cancel confirmation showing a conflict message) is not unmounted.
  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setState({ phase: 'loading' });
      try {
        const request = await getMyRentalRequest(id);
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

  // Called by the cancel dialog with the backend's returned (updated) request.
  const onCancelled = React.useCallback((updated: TenantRentalRequest) => {
    setState({ phase: 'ready', request: updated });
  }, []);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[{ label: 'My requests', href: '/requests' }, { label: 'Request details' }]}
        />

        <div className="mt-6">
          {state.phase === 'loading' && <RequestDetailSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'not-found' && (
            <EmptyState
              title="Request not found"
              description="This rental request doesn’t exist or is no longer available to you."
              action={
                <Button asChild>
                  <Link href="/requests">Back to my requests</Link>
                </Button>
              }
            />
          )}

          {state.phase === 'ready' && (
            <div className="space-y-6">
              <RequestSummaryProperty property={requireProperty(state.request)} />

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
                      <h3 className="text-sm font-medium text-foreground">Your message</h3>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {state.request.message}
                      </p>
                    </div>
                  )}

                  {state.request.status === 'PENDING' && (
                    <div className="border-t border-border pt-4">
                      <CancelRequestDialog
                        requestId={state.request.id}
                        onCancelled={onCancelled}
                        onConflict={() => void load(true)}
                      />
                    </div>
                  )}

                  {state.request.status === 'ACCEPTED' && (
                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-sm text-muted-foreground">
                        Your request was accepted. Continue to start the rental — this marks the
                        property as occupied. No payment is taken.
                      </p>
                      <Button asChild>
                        <Link href={`/requests/${state.request.id}/rental`}>
                          Continue to rental
                        </Link>
                      </Button>
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

/** The tenant detail response always includes the property; guard defensively. */
function requireProperty(request: TenantRentalRequest) {
  return (
    request.property ?? {
      id: request.propertyId,
      title: 'Property',
      propertyType: 'OTHER',
      monthlyRent: 0,
      currency: 'RWF',
      district: '',
      sector: '',
      status: 'UNAVAILABLE',
      isPublished: false,
    }
  );
}
