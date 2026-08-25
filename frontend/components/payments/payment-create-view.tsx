'use client';

import * as React from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/auth/auth-provider';
import { RequireRole } from '@/components/auth/require-role';
import { PaymentForm } from '@/components/payments/payment-form';
import { RentalPropertySummaryBlock } from '@/components/rentals/rental-property-summary';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { getMyRental } from '@/lib/rentals';
import type { TenantRental } from '@/types/rental';

type State =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error' }
  | { phase: 'not-payable'; rental: TenantRental }
  | { phase: 'ready'; rental: TenantRental };

/**
 * Payment page (F6), tenant-only. Loads the rental fresh and only offers payment
 * when it is ACTIVE; COMPLETED/TERMINATED rentals show a clear "payments
 * unavailable" state with a link to history. The backend is authoritative on
 * every rule (RENTAL_NOT_PAYABLE re-checked server-side).
 */
export function PaymentCreateView({ rentalId }: { rentalId: string }) {
  return (
    <RequireRole role="TENANT" forbiddenTitle="Payments are available to tenants">
      <PaymentCreateContent rentalId={rentalId} />
    </RequireRole>
  );
}

function PaymentCreateContent({ rentalId }: { rentalId: string }) {
  const { user } = useAuth();
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const rental = await getMyRental(rentalId);
      setState({ phase: rental.status === 'ACTIVE' ? 'ready' : 'not-payable', rental });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setState({ phase: 'not-found' });
        return;
      }
      setState({ phase: 'error' });
    }
  }, [rentalId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[
            { label: 'My rentals', href: '/rentals' },
            { label: 'Rental details', href: `/rentals/${rentalId}` },
            { label: 'Pay rent' },
          ]}
        />

        <div className="mt-6 space-y-6">
          {state.phase === 'loading' && <PaymentFormSkeleton />}

          {state.phase === 'error' && (
            <ErrorState
              title="We couldn’t load this rental"
              description="Please try again in a moment."
              onRetry={() => void load()}
            />
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

          {state.phase === 'not-payable' && (
            <>
              <RentalPropertySummaryBlock
                property={state.rental.property}
                monthlyRent={state.rental.monthlyRent}
                currency={state.rental.currency}
              />
              <EmptyState
                title="Payments are unavailable for this rental"
                description="This rental is no longer active, so new payments can’t be made. You can still review past payments."
                action={
                  <Button asChild variant="outline">
                    <Link href="/payments">View payment history</Link>
                  </Button>
                }
              />
            </>
          )}

          {state.phase === 'ready' && (
            <>
              <RentalPropertySummaryBlock
                property={state.rental.property}
                monthlyRent={state.rental.monthlyRent}
                currency={state.rental.currency}
              />
              <PaymentForm
                rentalId={state.rental.id}
                propertyTitle={state.rental.property.title}
                monthlyRent={state.rental.monthlyRent}
                currency={state.rental.currency}
                payerPhone={user?.phone ?? ''}
              />
            </>
          )}
        </div>
      </Section>
    </PageContainer>
  );
}

function PaymentFormSkeleton() {
  return (
    <div
      className="space-y-4 rounded-lg border border-border bg-card p-6"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading rental…</span>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
