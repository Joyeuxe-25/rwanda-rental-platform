import * as React from 'react';
import { Building2 } from 'lucide-react';

import { ClearFiltersButton } from '@/components/marketplace/clear-filters-button';
import { MarketplaceError } from '@/components/marketplace/marketplace-error';
import { PropertyGrid } from '@/components/properties/property-grid';
import { PropertyPagination } from '@/components/properties/property-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { ApiRequestError } from '@/lib/api';
import {
  hasActiveFilters,
  listPublishedProperties,
  type PropertyListParams,
} from '@/lib/properties';

/**
 * Streamed marketplace results (F2-R). Async server component: fetches the B17
 * public list for the given params and renders the result count + grid +
 * pagination, or a friendly empty/error state. Rendered inside a Suspense
 * boundary keyed by the query, so the filter bar stays mounted while results
 * reload. Public/anonymous; no write requests.
 */
export async function MarketplaceResults({ params }: { params: PropertyListParams }) {
  const filtersActive = hasActiveFilters(params);

  let result;
  try {
    result = await listPublishedProperties(params);
  } catch (err) {
    const rateLimited = err instanceof ApiRequestError && err.status === 429;
    return <MarketplaceError rateLimited={rateLimited} />;
  }

  const { properties, pagination } = result;

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="size-6" aria-hidden="true" />}
        title="No properties found"
        description={
          filtersActive
            ? 'No properties match your filters. Try adjusting or clearing them.'
            : 'There are no published properties to show yet. Please check back soon.'
        }
        action={filtersActive ? <ClearFiltersButton /> : undefined}
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {pagination.total === 1 ? '1 property found' : `${pagination.total} properties found`}
      </p>
      <PropertyGrid properties={properties} />
      <PropertyPagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        params={params}
      />
    </div>
  );
}
