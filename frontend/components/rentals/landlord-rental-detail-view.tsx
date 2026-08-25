'use client';

import * as React from 'react';
import Link from 'next/link';
import { UserRound } from 'lucide-react';

import { RequireRole } from '@/components/auth/require-role';
import { RentalFacts } from '@/components/rentals/rental-facts';
import { RentalLifecycleControls } from '@/components/rentals/rental-lifecycle-controls';
import { RentalPropertySummaryBlock } from '@/components/rentals/rental-property-summary';
import { RentalStatusBadge } from '@/components/rentals/rental-status-badge';
import { RentalTimeline } from '@/components/rentals/rental-timeline';
import { RentalDetailSkeleton } from '@/components/rentals/rental-skeletons';
import { rentalErrorMessage } from '@/components/rentals/rental-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api';
import { getLandlordRental } from '@/lib/rentals';
import type { LandlordRental } from '@/types/rental';

type State =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; rental: LandlordRental };

/** Landlord rental detail (F5). Landlord-only; complete/terminate an ACTIVE rental. */
export function LandlordRentalDetailView({ id }: { id: string }) {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Rentals is available to landlords">
      <LandlordRentalDetailContent id={id} />
    </RequireRole>
  );
}

function LandlordRentalDetailContent({ id }: { id: string }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });
  const [notice, setNotice] = React.useState<string | null>(null);

  // `silent` re-fetches without flipping to loading, so the inline controls (and
  // any conflict message) are not unmounted.
  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setState({ phase: 'loading' });
      try {
        const rental = await getLandlordRental(id);
        setState({ phase: 'ready', rental });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          setState({ phase: 'not-found' });
          return;
        }
        setState({ phase: 'error', message: rentalErrorMessage(err, 'detail') });
      }
    },
    [id],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const onUpdated = React.useCallback(
    (updated: LandlordRental, action: 'complete' | 'terminate') => {
      setState({ phase: 'ready', rental: updated });
      setNotice(
        action === 'complete'
          ? 'The rental was completed. The property is now available again.'
          : 'The rental was terminated. The property is now available again.',
      );
    },
    [],
  );

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[{ label: 'Rentals', href: '/landlord/rentals' }, { label: 'Rental details' }]}
        />

        <div className="mt-6">
          {state.phase === 'loading' && <RentalDetailSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'not-found' && (
            <EmptyState
              title="Rental not found"
              description="This rental doesn’t exist or isn’t for one of your properties."
              action={
                <Button asChild>
                  <Link href="/landlord/rentals">Back to rentals</Link>
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

              <RentalPropertySummaryBlock
                property={state.rental.property}
                monthlyRent={state.rental.monthlyRent}
                currency={state.rental.currency}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-h4">Tenant</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                    {state.rental.tenant.firstName} {state.rental.tenant.lastName}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-h4">Rental status</CardTitle>
                  <RentalStatusBadge status={state.rental.status} />
                </CardHeader>
                <CardContent className="space-y-6">
                  <RentalTimeline status={state.rental.status} />
                  <RentalFacts
                    monthlyRent={state.rental.monthlyRent}
                    securityDeposit={state.rental.securityDeposit}
                    currency={state.rental.currency}
                    startDate={state.rental.startDate}
                    endDate={state.rental.endDate}
                  />
                  {state.rental.status === 'ACTIVE' && (
                    <div className="border-t border-border pt-4">
                      <RentalLifecycleControls
                        rentalId={state.rental.id}
                        onUpdated={onUpdated}
                        onConflict={() => void load(true)}
                      />
                    </div>
                  )}

                  <div className="border-t border-border pt-4">
                    <Button asChild variant="outline">
                      <Link href="/landlord/payments">View payments</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </Section>
    </PageContainer>
  );
}
