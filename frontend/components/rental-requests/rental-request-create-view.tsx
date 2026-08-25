'use client';

import * as React from 'react';
import Link from 'next/link';

import { RequireRole } from '@/components/auth/require-role';
import { RentalRequestForm } from '@/components/rental-requests/rental-request-form';
import { RequestPropertySummary } from '@/components/rental-requests/request-property-summary';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { getPublicProperty } from '@/lib/properties';
import type { PublicProperty } from '@/types/property';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error' }
  | { phase: 'ready'; property: PublicProperty };

/**
 * Rental-request page (F4), tenant-only. Loads the property FRESH (availability
 * may have changed since the detail page) and gates submission on the current
 * status. Landlords see a safe role message (no tenant form); the backend is the
 * final authority on every rule.
 */
export function RentalRequestCreateView({ propertyId }: { propertyId: string }) {
  return (
    <RequireRole
      role="TENANT"
      forbiddenTitle="Rental requests are available to tenants"
      forbiddenDescription="Your account is registered as a landlord, so you can’t send a rental request. You can review requests for your own properties instead."
    >
      <RentalRequestCreateContent propertyId={propertyId} />
    </RequireRole>
  );
}

function RentalRequestCreateContent({ propertyId }: { propertyId: string }) {
  const [state, setState] = React.useState<LoadState>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const property = await getPublicProperty(propertyId, { fresh: true });
      if (!property) {
        setState({ phase: 'not-found' });
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
  }, [propertyId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[{ label: 'Properties', href: '/properties' }, { label: 'Request to rent' }]}
        />

        <div className="mt-6 space-y-6">
          {state.phase === 'loading' && <RequestFormSkeleton />}

          {state.phase === 'error' && (
            <ErrorState
              title="We couldn’t load this property"
              description="Please try again in a moment."
              onRetry={() => void load()}
              secondaryAction={
                <Button asChild variant="outline" size="sm">
                  <Link href="/properties">Browse properties</Link>
                </Button>
              }
            />
          )}

          {state.phase === 'not-found' && (
            <EmptyState
              title="This property is no longer available"
              description="It may have been removed or unpublished. Browse other available homes instead."
              action={
                <Button asChild>
                  <Link href="/properties">Browse properties</Link>
                </Button>
              }
            />
          )}

          {state.phase === 'ready' && (
            <>
              <RequestPropertySummary property={state.property} />
              {state.property.status === 'AVAILABLE' ? (
                <RentalRequestForm
                  propertyId={state.property.id}
                  propertyTitle={state.property.title}
                />
              ) : (
                <Card>
                  <CardContent className="space-y-4 p-6">
                    <h2 className="text-h4 font-semibold">
                      This property can’t be requested right now
                    </h2>
                    <p className="text-body text-muted-foreground">
                      It isn’t currently available to rent. Browse other available homes, or check
                      back later.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild>
                        <Link href="/properties">Browse properties</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href={`/properties/${state.property.id}`}>Back to property</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </Section>
    </PageContainer>
  );
}

function RequestFormSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading property…</span>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
