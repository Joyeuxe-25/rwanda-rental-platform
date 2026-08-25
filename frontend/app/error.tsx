'use client';

import { useEffect } from 'react';

import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { ErrorState } from '@/components/shared/error-state';

/**
 * Route-level error boundary (App Router). It shows only a SAFE, generic
 * message — it never renders the raw error text to the user (which could leak
 * internals). The full error is logged to the console for developers only.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Developer-only diagnostics; not shown to the user.
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <Section>
        <div className="mx-auto max-w-xl">
          <ErrorState
            title="Something went wrong"
            description="An unexpected error occurred. Please try again."
            onRetry={reset}
          />
        </div>
      </Section>
    </PageContainer>
  );
}
