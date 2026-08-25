import * as React from 'react';
import Link from 'next/link';

import { AuthNav } from '@/components/auth/auth-nav';
import { Logo } from '@/components/branding/logo';
import { MainNav } from '@/components/layout/main-nav';
import { MobileNav } from '@/components/layout/mobile-nav';
import { PageContainer } from '@/components/layout/page-container';

/**
 * Global header: brand + desktop navigation + a primary CTA, with a mobile menu
 * trigger on small screens. The CTA is a visual placeholder link — it performs
 * no backend/auth action (F1 is UI-only).
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/65">
      <PageContainer className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Rwanda Rental Platform home"
        >
          <Logo />
        </Link>

        <div className="hidden lg:flex lg:items-center lg:gap-8">
          <MainNav />
          <AuthNav />
        </div>

        <MobileNav />
      </PageContainer>
    </header>
  );
}
