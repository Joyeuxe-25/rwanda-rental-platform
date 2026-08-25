'use client';

import * as React from 'react';

import { RequireAuth } from '@/components/auth/require-auth';
import { AccountNav } from '@/components/account/account-nav';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';

/**
 * Shared authenticated account layout (F8): a role-aware account nav (sidebar on
 * desktop, stacked on mobile) beside the page content. Wraps `RequireAuth` so
 * private content never flashes before the session resolves. Used by the account
 * overview, profile, and security pages for a consistent shell.
 */
export function AccountShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <PageContainer>
        <Section spacing="md">
          <div className="mb-6">
            <h1 className="text-h1">{title}</h1>
            {description && <p className="text-body mt-1 text-muted-foreground">{description}</p>}
          </div>

          <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-20 lg:self-start">
              <AccountNav />
            </aside>
            <div className="min-w-0">{children}</div>
          </div>
        </Section>
      </PageContainer>
    </RequireAuth>
  );
}
