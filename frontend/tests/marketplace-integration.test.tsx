import { fireEvent, render, screen, within } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketplaceError } from '@/components/marketplace/marketplace-error';
import { PropertyFilters } from '@/components/properties/property-filters';
import { PropertyPagination } from '@/components/properties/property-pagination';
import { ApiRequestError } from '@/lib/api';
import {
  hasActiveFilters,
  listPublishedProperties,
  parsePropertyListParams,
} from '@/lib/properties';
import type { PropertyListItem } from '@/types/property';

const card: PropertyListItem = {
  id: 'prop-1',
  title: 'Sunny Apartment',
  propertyType: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 1,
  monthlyRent: 300000,
  securityDeposit: 300000,
  otherCharges: 0,
  currency: 'RWF',
  province: 'Kigali',
  district: 'Gasabo',
  sector: 'Remera',
  cell: null,
  village: null,
  additionalLocation: null,
  amenities: ['Parking'],
  status: 'AVAILABLE',
  landlord: { id: 'll-1', firstName: 'Jean', lastName: 'Uwimana' },
  images: [{ id: 'i1', url: '/api/v1/properties/prop-1/images/i1', isPrimary: true, sortOrder: 0 }],
  publishedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

let push: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push = vi.fn();
  vi.mocked(useRouter).mockReturnValue({
    push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
  );
});
afterEach(() => vi.restoreAllMocks());

// ============================================================================
// lib — param parsing & query building (only documented B17 params)
// ============================================================================
describe('property list params', () => {
  it('keeps documented keys, coerces numbers, and ignores junk', () => {
    const p = parsePropertyListParams({
      district: 'Gasabo',
      propertyType: 'APARTMENT',
      minRent: '100000',
      bedrooms: '2',
      page: '3',
      sort: 'rent_asc',
      bogus: 'x',
      hackerSql: '1;DROP TABLE',
    });
    expect(p).toMatchObject({
      district: 'Gasabo',
      propertyType: 'APARTMENT',
      minRent: 100000,
      bedrooms: 2,
      page: 3,
      sort: 'rent_asc',
    });
    expect(p).not.toHaveProperty('bogus');
    expect(p).not.toHaveProperty('hackerSql');
  });

  it('applies safe defaults (page 1, limit 12, sort newest) and validates sort', () => {
    const p = parsePropertyListParams({ sort: 'evil', limit: '9999', page: '0' });
    expect(p.page).toBe(1);
    expect(p.limit).toBe(12);
    expect(p.sort).toBe('newest');
  });

  it('hasActiveFilters ignores page/limit/sort', () => {
    expect(hasActiveFilters({ page: 2, limit: 12, sort: 'rent_asc' })).toBe(false);
    expect(hasActiveFilters({ district: 'Gasabo' })).toBe(true);
    expect(hasActiveFilters({ q: 'flat' })).toBe(true);
  });

  it('listPublishedProperties GETs only documented params with credentials', async () => {
    const body = {
      success: true,
      data: { properties: [card], pagination: { page: 1, limit: 12, total: 1, totalPages: 1 } },
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    const res = await listPublishedProperties({
      district: 'Gasabo',
      minRent: 100000,
      sort: 'rent_asc',
      page: 2,
    });
    expect(res.properties[0]?.title).toBe('Sunny Apartment');

    const url = (fetchSpy.mock.calls[0]![0] as string) ?? '';
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(url).toContain('/api/v1/properties?');
    expect(url).toContain('district=Gasabo');
    expect(url).toContain('minRent=100000');
    expect(url).toContain('sort=rent_asc');
    expect(url).toContain('page=2');
    expect(url).not.toContain('undefined');
    expect(init.credentials).toBe('include');
  });
});

// ============================================================================
// PropertyFilters — URL query state
// ============================================================================
describe('property filters', () => {
  it('search maps to ?q and resets page to 1', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('page=3') as unknown as ReturnType<typeof useSearchParams>,
    );
    render(<PropertyFilters />);
    fireEvent.change(screen.getByLabelText(/search properties/i), {
      target: { value: 'remera flat' },
    });
    fireEvent.submit(screen.getByRole('search'));
    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0]![0] as string;
    expect(url).toContain('q=remera+flat');
    expect(url).not.toContain('page='); // reset to 1 (omitted)
  });

  it('sort maps to B17 values and resets page', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('page=2') as unknown as ReturnType<typeof useSearchParams>,
    );
    render(<PropertyFilters />);
    fireEvent.change(screen.getByLabelText(/sort properties/i), { target: { value: 'rent_desc' } });
    const url = push.mock.calls[0]![0] as string;
    expect(url).toContain('sort=rent_desc');
    expect(url).not.toContain('page=');
  });

  it('applies sheet filters as documented query params (page reset)', async () => {
    render(<PropertyFilters />);
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('District'), { target: { value: 'Gasabo' } });
    fireEvent.change(within(dialog).getByLabelText(/min rent/i), { target: { value: '150000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /apply filters/i }));

    const url = push.mock.calls.at(-1)![0] as string;
    expect(url).toContain('district=Gasabo');
    expect(url).toContain('minRent=150000');
    expect(url).not.toContain('page=');
  });

  it('clear filters navigates to /properties', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('district=Gasabo&q=flat') as unknown as ReturnType<
        typeof useSearchParams
      >,
    );
    render(<PropertyFilters />);
    fireEvent.click(screen.getByRole('button', { name: /^clear filters$/i }));
    expect(push).toHaveBeenCalledWith('/properties');
  });

  it('makes no API request itself (navigation only)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    render(<PropertyFilters />);
    fireEvent.submit(screen.getByRole('search'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ============================================================================
// MarketplaceResults — data / empty / error (async server component)
// ============================================================================
async function renderResults(params: Record<string, unknown> = {}) {
  const { MarketplaceResults } = await import('@/components/marketplace/marketplace-results');
  const ui = await MarketplaceResults({ params });
  return render(ui);
}

describe('marketplace results', () => {
  it('renders the grid and result count from pagination.total', async () => {
    vi.spyOn(await import('@/lib/properties'), 'listPublishedProperties').mockResolvedValue({
      properties: [card, { ...card, id: 'prop-2', title: 'Second Home' }],
      pagination: { page: 1, limit: 12, total: 24, totalPages: 2 },
    });
    await renderResults();
    expect(screen.getByText('24 properties found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sunny Apartment/i })).toHaveAttribute(
      'href',
      '/properties/prop-1',
    );
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('renders "No properties found" with a Clear action when filters are active', async () => {
    vi.spyOn(await import('@/lib/properties'), 'listPublishedProperties').mockResolvedValue({
      properties: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
    });
    await renderResults({ district: 'Nowhere' });
    expect(screen.getByText(/No properties found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
    // No technical wording.
    expect(screen.queryByText(/database|api|sql|backend/i)).toBeNull();
  });

  it('renders a friendly error state on failure (no raw details)', async () => {
    vi.spyOn(await import('@/lib/properties'), 'listPublishedProperties').mockRejectedValue(
      new ApiRequestError('SQLITE_ERROR near line 3', 'REQUEST_FAILED', 500),
    );
    await renderResults();
    expect(screen.getByText(/couldn.t load properties/i)).toBeInTheDocument();
    expect(screen.queryByText(/SQLITE_ERROR/)).toBeNull();
  });

  it('renders a calm rate-limit message on 429', async () => {
    vi.spyOn(await import('@/lib/properties'), 'listPublishedProperties').mockRejectedValue(
      new ApiRequestError('Too many requests', 'AUTH_RATE_LIMITED', 429),
    );
    await renderResults();
    expect(screen.getByText(/a lot of people are browsing/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Pagination
// ============================================================================
describe('property pagination', () => {
  it('preserves filters in prev/next links and disables ends', () => {
    render(<PropertyPagination page={2} totalPages={3} params={{ district: 'Gasabo', page: 2 }} />);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    const prev = screen.getByRole('link', { name: /previous/i });
    const next = screen.getByRole('link', { name: /next/i });
    expect(prev).toHaveAttribute('href', '/properties?district=Gasabo'); // page 1 omitted
    expect(next).toHaveAttribute('href', '/properties?district=Gasabo&page=3');
  });

  it('disables Previous on the first page', () => {
    render(<PropertyPagination page={1} totalPages={3} params={{}} />);
    expect(screen.queryByRole('link', { name: /previous/i })).toBeNull();
    expect(screen.getByText('Previous').closest('span')).toHaveAttribute('aria-disabled', 'true');
  });

  it('is hidden when there is a single page', () => {
    const { container } = render(<PropertyPagination page={1} totalPages={1} params={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('marketplace error retry', () => {
  it('retries via router.refresh without an auto-loop', () => {
    const refresh = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh,
    } as unknown as ReturnType<typeof useRouter>);
    render(<MarketplaceError />);
    expect(refresh).not.toHaveBeenCalled(); // no auto-retry
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
