'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { AuthLoading } from '@/components/auth/auth-loading';
import { useAuth } from '@/components/auth/auth-provider';

/**
 * Client-side route guard for protected pages (F3). While auth is `loading` it
 * shows `AuthLoading` (no private content flashes). When `unauthenticated` it
 * redirects to `/login?returnTo=<current path>` (once). Only `authenticated`
 * renders the children.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status === 'unauthenticated') {
      const returnTo = encodeURIComponent(pathname || '/account');
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [status, router, pathname]);

  if (status !== 'authenticated') return <AuthLoading />;
  return <>{children}</>;
}
