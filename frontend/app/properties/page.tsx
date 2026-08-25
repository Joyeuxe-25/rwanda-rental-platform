import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MarketplaceResults } from '@/components/marketplace/marketplace-results';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { PropertyFilters } from '@/components/properties/property-filters';
import { PropertyGridSkeleton } from '@/components/properties/property-grid';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { parsePropertyListParams } from '@/lib/properties';

export const metadata: Metadata = {
  title: 'Properties',
  description: 'Discover published rental properties across Rwanda on the Rwanda Rental Platform.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Public marketplace page (F2-R). Reads filters from the URL, then STREAMS the
 * results (B17 `GET /api/v1/properties`) inside a Suspense boundary keyed by the
 * query — so the filter bar stays mounted and a grid skeleton shows while
 * results load. Anonymous/public; no authentication and no write requests.
 */
export default async function PropertiesPage({ searchParams }: PageProps) {
  const params = parsePropertyListParams(await searchParams);
  const suspenseKey = JSON.stringify(params);

  return (
    <PageContainer>
      <Section spacing="md">
        <Breadcrumb
          items={[{ label: 'Home', href: '/' }, { label: 'Properties' }]}
          className="mb-4"
        />
        <h1 className="text-h1">Properties</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Discover published rentals across Rwanda. Filter by location, type, price, and size.
        </p>
        <div className="mt-6">
          {/* useSearchParams inside — wrapped in Suspense per Next.js guidance. */}
          <Suspense fallback={null}>
            <PropertyFilters />
          </Suspense>
        </div>
      </Section>

      <Section spacing="sm" className="pt-0" aria-label="Property results">
        <Suspense key={suspenseKey} fallback={<PropertyGridSkeleton count={6} />}>
          <MarketplaceResults params={params} />
        </Suspense>
      </Section>
    </PageContainer>
  );
}
