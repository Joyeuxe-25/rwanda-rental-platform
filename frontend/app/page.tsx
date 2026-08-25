import Link from 'next/link';
import { HandCoins, MapPinned, ShieldCheck, ArrowRight } from 'lucide-react';

import { MarketplaceHero } from '@/components/marketplace/marketplace-hero';
import { Grid } from '@/components/layout/grid';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Public homepage (F2). Marketplace-oriented discovery. It renders NO fabricated
 * listings — the backend has no public list endpoint yet, so discovery is a
 * lookup by reference plus a link to the marketplace page. No authentication is
 * required and no write APIs are called.
 */
export default function HomePage() {
  return (
    <PageContainer>
      <MarketplaceHero />

      <Section
        title="Why rent with us"
        description="A calm, trustworthy experience built for renting across Rwanda."
        headingId="why"
      >
        <Grid cols={3}>
          <Card>
            <CardHeader>
              <HandCoins className="size-5 text-accent" aria-hidden="true" />
              <CardTitle>Clear pricing</CardTitle>
              <CardDescription>
                Rent, deposit, and any other charges shown up front in Rwandan Francs — no
                surprises.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <MapPinned className="size-5 text-secondary" aria-hidden="true" />
              <CardTitle>Real Rwanda locations</CardTitle>
              <CardDescription>
                Human-readable province, district, and sector details — not confusing coordinates.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              <CardTitle>Honest listings</CardTitle>
              <CardDescription>
                Only published properties, with accurate availability sourced from the platform.
              </CardDescription>
            </CardHeader>
          </Card>
        </Grid>
      </Section>

      <Section spacing="lg" className="pt-0">
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-soft sm:p-12">
          <h2 className="text-h2">Ready to find your next home?</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Browse the marketplace to discover available rentals across the country.
          </p>
          <div className="mt-6">
            <Button size="lg" asChild>
              <Link href="/properties">
                Explore properties
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </Section>
    </PageContainer>
  );
}
