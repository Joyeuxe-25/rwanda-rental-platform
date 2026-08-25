'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

import { AuthLoading } from '@/components/auth/auth-loading';
import { useAuth } from '@/components/auth/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/types/auth';

/**
 * Client-side guard for role-restricted pages (F4). Builds on the F3 auth model:
 *  - `loading`         → AuthLoading (no private content flashes).
 *  - `unauthenticated` → redirect to `/login?returnTo=<current path>` (once).
 *  - wrong role        → a safe forbidden state (NOT a redirect, and never the
 *                        other role's data). The copy is caller-supplied so it
 *                        can be phrased for the specific page.
 *  - correct role      → children.
 *
 * Authorization is ALWAYS re-enforced by the backend; this is UX only.
 */
export function RequireRole({
  role,
  children,
  forbiddenTitle = 'This page is not available for your account',
  forbiddenDescription,
}: {
  role: UserRole;
  children: React.ReactNode;
  forbiddenTitle?: string;
  forbiddenDescription?: string;
}) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status === 'unauthenticated') {
      const returnTo = encodeURIComponent(pathname || '/account');
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [status, router, pathname]);

  if (status !== 'authenticated' || !user) return <AuthLoading />;

  if (user.role !== role) {
    return (
      <PageContainer size="content">
        <Section spacing="lg">
          <EmptyState
            icon={<ShieldAlert className="size-6" aria-hidden="true" />}
            title={forbiddenTitle}
            description={
              forbiddenDescription ??
              (role === 'TENANT'
                ? 'Rental requests are available to tenants.'
                : 'This area is available to landlords.')
            }
            action={
              <Button asChild variant="outline">
                <Link href="/account">Back to account</Link>
              </Button>
            }
          />
        </Section>
      </PageContainer>
    );
  }

  return <>{children}</>;
}
