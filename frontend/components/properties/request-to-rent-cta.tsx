'use client';

import * as React from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/auth/auth-provider';
import { isRequestable } from '@/components/properties/property-status-badge';
import { Button } from '@/components/ui/button';
import type { PropertyStatus } from '@/types/property';

/**
 * "Request to Rent" CTA (F4). NAVIGATION ONLY — it NEVER submits a request or
 * calls POST from the property page (the request page owns submission). Behavior:
 *  - not AVAILABLE          → disabled (does not look requestable).
 *  - not signed in / loading → `/login?returnTo=/properties/:id/request`.
 *  - signed-in TENANT       → `/properties/:id/request` (the request form).
 *  - signed-in LANDLORD     → a safe role message (no tenant form, no submit).
 *
 * The wording stays "Request to Rent" — never "Rent Now".
 */
export function RequestToRentCta({
  propertyId,
  status,
  className,
}: {
  propertyId: string;
  /** Accepted for API symmetry with the detail view; not used for navigation. */
  propertyTitle?: string;
  status: PropertyStatus;
  className?: string;
}) {
  const { status: authStatus, user } = useAuth();
  const requestPath = `/properties/${propertyId}/request`;

  if (!isRequestable(status)) {
    return (
      <Button className={className} size="lg" disabled aria-disabled="true">
        Not available to request
      </Button>
    );
  }

  // Signed-in landlord → a safe message; landlords cannot submit tenant requests.
  if (authStatus === 'authenticated' && user?.role === 'LANDLORD') {
    return (
      <div className={className}>
        <Button size="lg" className="w-full" disabled aria-disabled="true">
          Request to Rent
        </Button>
        <p className="text-caption mt-2">Rental requests are available to tenants.</p>
      </div>
    );
  }

  // Signed-in tenant → the request form. Not signed in (or still resolving) →
  // login, preserving intent to land back on the request form afterwards.
  const href =
    authStatus === 'authenticated'
      ? requestPath
      : `/login?returnTo=${encodeURIComponent(requestPath)}`;

  return (
    <Button className={className} size="lg" asChild>
      <Link href={href}>Request to Rent</Link>
    </Button>
  );
}
