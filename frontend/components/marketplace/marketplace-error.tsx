'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { ErrorState } from '@/components/shared/error-state';

/**
 * Friendly marketplace error surface (F2-R). Shows only safe, user-facing copy —
 * never raw API/backend details — and offers a single "Try again" that
 * re-fetches (no auto-retry loop). A 429 (rate limit) gets a calmer message.
 */
export function MarketplaceError({ rateLimited = false }: { rateLimited?: boolean }) {
  const router = useRouter();
  return (
    <ErrorState
      title={rateLimited ? 'A lot of people are browsing right now' : "We couldn't load properties"}
      description={
        rateLimited
          ? 'Please wait a moment and try again.'
          : 'Something went wrong loading properties. Please try again.'
      }
      onRetry={() => router.refresh()}
    />
  );
}
