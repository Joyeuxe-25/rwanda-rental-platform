import { fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The property CTA/detail now consume auth state; stub it as unauthenticated
// here (auth flows are covered in tests/auth.test.tsx).
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    setUser: vi.fn(),
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import HomePage from '@/app/page';
import { PropertyLookup } from '@/components/marketplace/property-lookup';
import { PropertyCard } from '@/components/properties/property-card';
import { PropertyDetail } from '@/components/properties/property-detail';
import { PropertyDetailSkeleton } from '@/components/properties/property-detail-skeleton';
import { PropertyGallery } from '@/components/properties/property-gallery';
import { PropertyGrid, PropertyGridSkeleton } from '@/components/properties/property-grid';
import { RequestToRentCta } from '@/components/properties/request-to-rent-cta';
import { formatMoney, formatMonthlyRent } from '@/lib/format';
import type { PublicProperty } from '@/types/property';

const mockProperty: PublicProperty = {
  id: 'prop-123',
  title: 'Sunny Apartment in Remera',
  description: 'A bright two-bedroom apartment.',
  propertyType: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 1,
  monthlyRent: 300000,
  securityDeposit: 250000,
  otherCharges: 20000,
  currency: 'RWF',
  province: 'Kigali City',
  district: 'Gasabo',
  sector: 'Remera',
  cell: 'Rukiri',
  village: null,
  additionalLocation: null,
  amenities: ['WiFi', 'Parking', 'Water tank'],
  status: 'AVAILABLE',
  landlord: { id: 'll-1', firstName: 'Jean', lastName: 'Uwimana' },
  images: [
    { id: 'img1', url: '/api/v1/properties/prop-123/images/img1', isPrimary: true, sortOrder: 0 },
    { id: 'img2', url: '/api/v1/properties/prop-123/images/img2', isPrimary: false, sortOrder: 1 },
  ],
  publishedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

afterEach(() => vi.restoreAllMocks());

describe('money formatting', () => {
  it('formats integer RWF with thousands separators (no floats)', () => {
    expect(formatMoney(300000)).toBe('RWF 300,000');
    expect(formatMonthlyRent(300000)).toBe('RWF 300,000 / month');
    expect(formatMoney(1000000)).toBe('RWF 1,000,000');
  });
});

describe('homepage / marketplace', () => {
  it('renders marketplace discovery content (no fabricated listings)', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /Find a place to call home/i,
    );
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('property lookup navigates to the detail route (no API call itself)', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    render(<PropertyLookup />);
    fireEvent.change(screen.getByLabelText(/property reference/i), {
      target: { value: 'prop-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /find property/i }));

    expect(push).toHaveBeenCalledWith('/properties/prop-123');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('property card & grid', () => {
  it('shows safe public fields and links to the detail page', () => {
    render(<PropertyCard property={mockProperty} />);
    const link = screen.getByRole('link', { name: /Sunny Apartment in Remera/i });
    expect(link).toHaveAttribute('href', '/properties/prop-123');
    expect(screen.getByText('RWF 300,000 / month')).toBeInTheDocument();
    expect(screen.getByText(/Remera, Gasabo, Kigali City/)).toBeInTheDocument();
    expect(screen.getByText(/Listed by Jean Uwimana/)).toBeInTheDocument();
  });

  it('does not expose landlord contact details', () => {
    const { container } = render(<PropertyCard property={mockProperty} />);
    expect(container.textContent).not.toMatch(/@|\+250|phone|email/i);
  });

  it('renders a grid of API-shaped results', () => {
    render(
      <PropertyGrid
        properties={[mockProperty, { ...mockProperty, id: 'prop-999', title: 'Second Home' }]}
      />,
    );
    expect(screen.getByRole('link', { name: /Sunny Apartment/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Second Home/i })).toBeInTheDocument();
  });

  it('renders grid loading skeletons', () => {
    const { container } = render(<PropertyGridSkeleton count={3} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

describe('property detail', () => {
  it('renders title, rent, deposit, amenities, location, status, and landlord name', () => {
    render(<PropertyDetail property={mockProperty} />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Sunny Apartment in Remera/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/RWF 300,000/)).toBeInTheDocument();
    expect(screen.getByText('RWF 20,000')).toBeInTheDocument(); // other charges
    expect(screen.getByText('WiFi')).toBeInTheDocument();
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Location/i })).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText(/Listed by Jean Uwimana/)).toBeInTheDocument();
  });

  it('never renders landlord contact details', () => {
    const { container } = render(<PropertyDetail property={mockProperty} />);
    expect(container.textContent).not.toMatch(/@|\+250/);
  });

  it('when signed out, Request to Rent links to login with returnTo (no API call)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    render(
      <RequestToRentCta propertyId="prop-123" propertyTitle="Sunny Apartment" status="AVAILABLE" />,
    );
    const cta = screen.getByRole('link', { name: 'Request to Rent' });
    expect(cta).toHaveAttribute('href', '/login?returnTo=%2Fproperties%2Fprop-123%2Frequest');
    fireEvent.click(cta);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an unavailable property is not presented as requestable', () => {
    render(<RequestToRentCta propertyId="p" propertyTitle="X" status="OCCUPIED" />);
    expect(screen.queryByRole('button', { name: 'Request to Rent' })).toBeNull();
    expect(screen.getByRole('button', { name: /not available to request/i })).toBeDisabled();
  });

  it('renders the detail loading skeleton', () => {
    render(<PropertyDetailSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('image gallery', () => {
  it('renders the primary image using the backend URL', () => {
    render(<PropertyGallery images={mockProperty.images} title="Sunny Apartment" />);
    const imgs = screen.getAllByRole('img');
    const main = imgs.find((i) => (i as HTMLImageElement).src.includes('/images/img1'));
    expect(main).toBeTruthy();
    expect((main as HTMLImageElement).src).toContain('http://localhost:4000/api/v1/properties/');
  });

  it('shows a designed fallback when there are no images', () => {
    render(<PropertyGallery images={[]} title="No Photos Home" />);
    expect(screen.getByText(/No image available/i)).toBeInTheDocument();
  });
});
