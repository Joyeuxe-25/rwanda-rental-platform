'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { RequireRole } from '@/components/auth/require-role';
import { PropertyForm } from '@/components/manage-properties/property-form';
import { ManagedPropertyDetailSkeleton } from '@/components/manage-properties/manage-property-skeletons';
import { propertyErrorMessage } from '@/components/manage-properties/property-management-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { ErrorState } from '@/components/shared/error-state';
import { getMyProperty, updateMyProperty } from '@/lib/managed-properties';
import type { ManagedProperty, PropertyUpdateInput } from '@/types/managed-property';

/** Edit-property page body (F11). Landlord-only; ownership enforced by backend. */
export function PropertyEditView({ id }: { id: string }) {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Property management is available to landlords">
      <PropertyEditContent id={id} />
    </RequireRole>
  );
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; property: ManagedProperty };

function PropertyEditContent({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({ phase: 'loading' });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const property = await getMyProperty(id);
      setState({ phase: 'ready', property });
    } catch (err) {
      setState({ phase: 'error', message: propertyErrorMessage(err) });
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(changed: PropertyUpdateInput) {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await updateMyProperty(id, changed);
      router.push(`/landlord/properties/${id}`);
    } catch (err) {
      setError(propertyErrorMessage(err));
      setSubmitting(false);
      busyRef.current = false;
    }
  }

  return (
    <PageContainer size="content">
      <Section spacing="md" title="Edit property" headingId="edit-property-heading">
        {state.phase === 'loading' && <ManagedPropertyDetailSkeleton />}

        {state.phase === 'error' && (
          <ErrorState description={state.message} onRetry={() => void load()} />
        )}

        {state.phase === 'ready' && (
          <PropertyForm
            mode="edit"
            initial={state.property}
            cancelHref={`/landlord/properties/${id}`}
            submitting={submitting}
            serverError={error}
            onSubmit={({ changed }) => void handleSubmit(changed)}
          />
        )}
      </Section>
    </PageContainer>
  );
}
