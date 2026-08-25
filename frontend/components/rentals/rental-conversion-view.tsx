'use client';

import * as React from 'react';
import Link from 'next/link';

import { RequireRole } from '@/components/auth/require-role';
import { RentalConversionForm } from '@/components/rentals/rental-conversion-form';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { getMyRentalRequest } from '@/lib/rental-requests';
import { getPublicProperty } from '@/lib/properties';
import type { PublicProperty } from '@/types/property';

type State =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error' }
  | { phase: 'not-accepted'; status: string }
  | { phase: 'unavailable' }
  | { phase: 'ready'; property: PublicProperty };

/**
 * Rental conversion page (F5), tenant-only. Only an ACCEPTED request can be
 * converted; the property is loaded FRESH for authoritative money + availability.
 * The backend is the final authority — every rule here is a UX gate, re-enforced
 * server-side.
 */
export function RentalConversionView({ requestId }: { requestId: string }) {
  return (
    <RequireRole role="TENANT" forbiddenTitle="Rentals are available to tenants">
      <RentalConversionContent requestId={requestId} />
    </RequireRole>
  );
}

function RentalConversionContent({ requestId }: { requestId: string }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const request = await getMyRentalRequest(requestId);
      if (request.status !== 'ACCEPTED') {
        setState({ phase: 'not-accepted', status: request.status });
        return;
      }
      const property = await getPublicProperty(request.propertyId, { fresh: true });
      if (!property || property.status !== 'AVAILABLE') {
        setState({ phase: 'unavailable' });
        return;
      }
      setState({ phase: 'ready', property });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setState({ phase: 'not-found' });
        return;
      }
      setState({ phase: 'error' });
    }
  }, [requestId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[
            { label: 'My requests', href: '/requests' },
            { label: 'Request details', href: `/requests/${requestId}` },
            { label: 'Start rental' },
          ]}
        />

        <div className="mt-6 space-y-6">
          {state.phase === 'loading' && <ConversionSkeleton />}

          {state.phase === 'error' && (
            <ErrorState
              title="We couldn’t load this request"
              description="Please try again in a moment."
              onRetry={() => void load()}
            />
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

          {state.phase === 'not-accepted' && (
            <EmptyState
              title="This request can’t be started yet"
              description="Only an accepted request can be started as a rental. The landlord hasn’t accepted this request."
              action={
                <Button asChild variant="outline">
                  <Link href={`/requests/${requestId}`}>Back to request</Link>
                </Button>
              }
            />
          )}

          {state.phase === 'unavailable' && (
            <EmptyState
              title="This property is no longer available"
              description="It can’t be started as a new rental right now. If you already started it, you’ll find it in your rentals."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href="/rentals">My rentals</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/properties">Browse properties</Link>
                  </Button>
                </div>
              }
            />
          )}

          {state.phase === 'ready' && (
            <RentalConversionForm rentalRequestId={requestId} property={state.property} />
          )}
        </div>
      </Section>
    </PageContainer>
  );
}

function ConversionSkeleton() {
  return (
    <div
      className="space-y-4 rounded-lg border border-border bg-card p-6"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading rental…</span>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
