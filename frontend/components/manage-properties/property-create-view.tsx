'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { RequireRole } from '@/components/auth/require-role';
import { PropertyForm } from '@/components/manage-properties/property-form';
import { propertyErrorMessage } from '@/components/manage-properties/property-management-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { createProperty } from '@/lib/managed-properties';

/** Create-property page body (F11). Landlord-only. */
export function PropertyCreateView() {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Property management is available to landlords">
      <PropertyCreateContent />
    </RequireRole>
  );
}

function PropertyCreateContent() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);

  async function handleSubmit(payload: { full: Parameters<typeof createProperty>[0] }) {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createProperty(payload.full);
      router.push(`/landlord/properties/${created.id}`);
    } catch (err) {
      setError(propertyErrorMessage(err));
      setSubmitting(false);
      busyRef.current = false;
    }
  }

  return (
    <PageContainer size="content">
      <Section
        spacing="md"
        title="Add a property"
        headingId="create-property-heading"
        description="Create a draft listing. You choose when to publish it to the marketplace."
      >
        <PropertyForm
          mode="create"
          cancelHref="/landlord/properties"
          submitting={submitting}
          serverError={error}
          onSubmit={({ full }) => void handleSubmit({ full })}
        />
      </Section>
    </PageContainer>
  );
}
