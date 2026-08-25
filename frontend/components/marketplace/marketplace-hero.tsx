import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { PropertyLookup } from '@/components/marketplace/property-lookup';
import { Section } from '@/components/layout/section';
import { Button } from '@/components/ui/button';

/**
 * Editorial marketplace hero. Because the backend currently exposes property
 * DETAIL (not a public list/search), the primary discovery affordance is a
 * lookup by property reference; a browse CTA links to the marketplace page.
 */
export function MarketplaceHero() {
  return (
    <Section spacing="lg" className="pb-6">
      <div className="max-w-2xl">
        <h1 className="text-display text-balance">Find a place to call home in Rwanda.</h1>
        <p className="text-body-lg mt-5 text-pretty text-muted-foreground">
          A calm, trustworthy way to discover rentals — clear pricing, real locations, and honest
          listings from landlords across the country.
        </p>
        <div className="mt-7 max-w-xl">
          <PropertyLookup />
        </div>
        <div className="mt-5">
          <Button variant="ghost" asChild>
            <Link href="/properties">
              Browse the marketplace
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
