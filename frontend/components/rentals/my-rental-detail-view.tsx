'use client';

import * as React from 'react';
import Link from 'next/link';
import { CreditCard, UserRound } from 'lucide-react';

import { RequireRole } from '@/components/auth/require-role';
import { RentalFacts } from '@/components/rentals/rental-facts';
import { RentalPropertySummaryBlock } from '@/components/rentals/rental-property-summary';
import { RentalStatusBadge } from '@/components/rentals/rental-status-badge';
import { RentalTimeline } from '@/components/rentals/rental-timeline';
import { RentalDetailSkeleton } from '@/components/rentals/rental-skeletons';
import { rentalErrorMessage } from '@/components/rentals/rental-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api';
import { getMyRental } from '@/lib/rentals';
import type { TenantRental } from '@/types/rental';

type State =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; rental: TenantRental };

/** Tenant rental detail (F5). Tenant-only; read-only (lifecycle is landlord-only). */
export function MyRentalDetailView({ id }: { id: string }) {
  return (
    <RequireRole role="TENANT" forbiddenTitle="My rentals is available to tenants">
      <MyRentalDetailContent id={id} />
    </RequireRole>
  );
}

function MyRentalDetailContent({ id }: { id: string }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const rental = await getMyRental(id);
      setState({ phase: 'ready', rental });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setState({ phase: 'not-found' });
        return;
      }
      setState({ phase: 'error', message: rentalErrorMessage(err, 'detail') });
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[{ label: 'My rentals', href: '/rentals' }, { label: 'Rental details' }]}
        />

        <div className="mt-6">
          {state.phase === 'loading' && <RentalDetailSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'not-found' && (
            <EmptyState
              title="Rental not found"
              description="This rental doesn’t exist or is no longer available to you."
              action={
                <Button asChild>
                  <Link href="/rentals">Back to my rentals</Link>
                </Button>
              }
            />
          )}

          {state.phase === 'ready' && (
            <div className="space-y-6">
              <RentalPropertySummaryBlock
                property={state.rental.property}
                monthlyRent={state.rental.monthlyRent}
                currency={state.rental.currency}
              />

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
                  <div className="border-t border-border pt-4">
                    <h3 className="text-sm font-medium text-foreground">Landlord</h3>
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <UserRound className="size-4" aria-hidden="true" />
                      {state.rental.landlord.firstName} {state.rental.landlord.lastName}
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-border pt-4">
                    {state.rental.status === 'ACTIVE' ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Pay this month’s rent by mobile money. No payment is taken until you
                          confirm on your phone.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild>
                            <Link href={`/rentals/${state.rental.id}/pay`}>
                              <CreditCard className="size-4" />
                              Make payment
                            </Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link href="/payments">View payment history</Link>
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button asChild variant="outline">
                        <Link href="/payments">View payment history</Link>
                      </Button>
                    )}
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
