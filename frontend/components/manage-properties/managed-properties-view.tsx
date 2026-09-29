'use client';

import * as React from 'react';
import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';

import { RequireRole } from '@/components/auth/require-role';
import { ManagedPropertyCard } from '@/components/manage-properties/managed-property-card';
import { ManagedPropertyListSkeleton } from '@/components/manage-properties/manage-property-skeletons';
import { propertyErrorMessage } from '@/components/manage-properties/property-management-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { listMyProperties } from '@/lib/managed-properties';
import type { ManagedProperty } from '@/types/managed-property';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; properties: ManagedProperty[] };

/** Landlord "My Properties" list (F11). Landlord-only, noindex (page metadata). */
export function ManagedPropertiesView() {
  return (
    <RequireRole
      role="LANDLORD"
      forbiddenTitle="Property management is available to landlords"
      forbiddenDescription="Sign in with a landlord account to manage your listings."
    >
      <ManagedPropertiesContent />
    </RequireRole>
  );
}

function ManagedPropertiesContent() {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const properties = await listMyProperties();
      setState({ phase: 'ready', properties });
    } catch (err) {
      setState({ phase: 'error', message: propertyErrorMessage(err) });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section
        spacing="md"
        title="My properties"
        headingId="my-properties-heading"
        description="Create listings, manage photos, and publish to the marketplace."
        actions={
          <Button asChild>
            <Link href="/landlord/properties/new">
              <Plus aria-hidden="true" />
              Add property
            </Link>
          </Button>
        }
      >
        {state.phase === 'loading' && <ManagedPropertyListSkeleton />}

        {state.phase === 'error' && (
          <ErrorState description={state.message} onRetry={() => void load()} />
        )}

        {state.phase === 'ready' &&
          (state.properties.length === 0 ? (
            <EmptyState
              icon={<Building2 className="size-6" aria-hidden="true" />}
              title="No properties yet"
              description="Add your first property to start attracting tenants. You control when it goes live."
              action={
                <Button asChild>
                  <Link href="/landlord/properties/new">
                    <Plus aria-hidden="true" />
                    Add property
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {state.properties.map((property) => (
                <li key={property.id}>
                  <ManagedPropertyCard property={property} />
                </li>
              ))}
            </ul>
          ))}
      </Section>
    </PageContainer>
  );
}
