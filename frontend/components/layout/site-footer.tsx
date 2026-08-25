import * as React from 'react';
import Link from 'next/link';

import { Logo } from '@/components/branding/logo';
import { PageContainer } from '@/components/layout/page-container';
import { Separator } from '@/components/ui/separator';
import { footerNav } from '@/lib/nav';

/**
 * Global product footer: brand blurb + foundation link columns (Platform /
 * Support / Legal placeholders) and the required NEROXIAFRICA credit. The
 * NEROXIAFRICA link opens in a new tab with a safe `rel` (preserved from F0).
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <PageContainer className="py-12">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">
              A calm, trustworthy way to find and manage rentals across Rwanda — connecting
              landlords and tenants.
            </p>
          </div>

          {footerNav.map((col) => (
            <nav key={col.heading} aria-label={col.heading} className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{col.heading}</h2>
              <ul className="space-y-2">
                {col.items.map((item) => (
                  <li key={`${col.heading}-${item.label}`}>
                    <Link
                      href={item.href}
                      className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © {year} Rwanda Rental Platform. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Powered by{' '}
            <a
              href="https://neroxiafrica.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              NEROXIAFRICA
            </a>
          </p>
        </div>
      </PageContainer>
    </footer>
  );
}
