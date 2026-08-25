import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock auth data access so the AuthProvider hydrates to a chosen role.
vi.mock('@/lib/auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth')>();
  return { ...actual, fetchCurrentUser: vi.fn(), logoutRequest: vi.fn() };
});
// Mock rental + rental-request + property data access (no real network).
vi.mock('@/lib/rentals', () => ({
  createRentalFromRequest: vi.fn(),
  listMyRentals: vi.fn(),
  getMyRental: vi.fn(),
  listLandlordRentals: vi.fn(),
  getLandlordRental: vi.fn(),
  completeRental: vi.fn(),
  terminateRental: vi.fn(),
}));
vi.mock('@/lib/rental-requests', () => ({ getMyRentalRequest: vi.fn() }));
vi.mock('@/lib/properties', () => ({ getPublicProperty: vi.fn() }));

import * as authApi from '@/lib/auth';
import * as rentalsApi from '@/lib/rentals';
import { getMyRentalRequest } from '@/lib/rental-requests';
import { getPublicProperty } from '@/lib/properties';
import { AuthProvider } from '@/components/auth/auth-provider';
import { RentalStatusBadge } from '@/components/rentals/rental-status-badge';
import { RentalConversionView } from '@/components/rentals/rental-conversion-view';
import { MyRentalsView } from '@/components/rentals/my-rentals-view';
import { MyRentalDetailView } from '@/components/rentals/my-rental-detail-view';
import { LandlordRentalsView } from '@/components/rentals/landlord-rentals-view';
import { LandlordRentalDetailView } from '@/components/rentals/landlord-rental-detail-view';
import { ApiRequestError } from '@/lib/api';
import type { AuthUser } from '@/types/auth';
import type { LandlordRental, TenantRental, RentalPropertySummary } from '@/types/rental';
import type { PublicProperty } from '@/types/property';

const tenant: AuthUser = {
  id: 't1',
  role: 'TENANT',
  firstName: 'Jean',
  lastName: 'Uwimana',
  email: 'jean@example.rw',
  phone: '+250788123456',
  profileImageKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const landlord: AuthUser = { ...tenant, id: 'l1', role: 'LANDLORD', firstName: 'Aline' };

const propSummary: RentalPropertySummary = {
  id: 'prop-1',
  title: 'Sunny Apartment in Remera',
  propertyType: 'APARTMENT',
  district: 'Gasabo',
  sector: 'Remera',
  status: 'OCCUPIED',
};

const fullProperty: PublicProperty = {
  id: 'prop-1',
  title: 'Sunny Apartment in Remera',
  description: null,
  propertyType: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 1,
  monthlyRent: 300000,
  securityDeposit: 250000,
  otherCharges: 0,
  currency: 'RWF',
  province: 'Kigali City',
  district: 'Gasabo',
  sector: 'Remera',
  cell: null,
  village: null,
  additionalLocation: null,
  amenities: [],
  status: 'AVAILABLE',
  landlord: { id: 'l1', firstName: 'Aline', lastName: 'M' },
  images: [],
  publishedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tenantRental = (over: Partial<TenantRental> = {}): TenantRental => ({
  id: 'rent-1',
  propertyId: 'prop-1',
  rentalRequestId: 'req-1',
  status: 'ACTIVE',
  startDate: '2026-08-20T00:00:00.000Z',
  endDate: null,
  monthlyRent: 300000,
  securityDeposit: 250000,
  currency: 'RWF',
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
  property: propSummary,
  landlord: { id: 'l1', firstName: 'Aline', lastName: 'M' },
  ...over,
});

const landlordRental = (over: Partial<LandlordRental> = {}): LandlordRental => ({
  id: 'rent-1',
  propertyId: 'prop-1',
  rentalRequestId: 'req-1',
  status: 'ACTIVE',
  startDate: '2026-08-20T00:00:00.000Z',
  endDate: null,
  monthlyRent: 300000,
  securityDeposit: 250000,
  currency: 'RWF',
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
  property: propSummary,
  tenant: { id: 't1', firstName: 'Jean', lastName: 'Uwimana' },
  ...over,
});

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
  vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
});
afterEach(() => vi.clearAllMocks());

const withProvider = (ui: React.ReactNode) => render(<AuthProvider>{ui}</AuthProvider>);
const acceptedReq = { id: 'req-1', propertyId: 'prop-1', status: 'ACCEPTED' };

// ============================================================================
// Status badges
// ============================================================================
describe('rental status badge', () => {
  it('renders each rental status with icon + text', () => {
    const { rerender } = render(<RentalStatusBadge status="ACTIVE" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    rerender(<RentalStatusBadge status="COMPLETED" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    rerender(<RentalStatusBadge status="TERMINATED" />);
    expect(screen.getByText('Terminated')).toBeInTheDocument();
  });
});

// ============================================================================
// Conversion
// ============================================================================
describe('rental conversion', () => {
  it('a tenant reaches the conversion form with property + money context', async () => {
    vi.mocked(getMyRentalRequest).mockResolvedValue(acceptedReq as never);
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    withProvider(<RentalConversionView requestId="req-1" />);
    expect(await screen.findByRole('button', { name: /start rental/i })).toBeInTheDocument();
    expect(screen.getByText(/RWF 300,000/)).toBeInTheDocument();
    expect(screen.getByText(/RWF 250,000/)).toBeInTheDocument();
  });

  it('does not offer conversion for a non-accepted request', async () => {
    vi.mocked(getMyRentalRequest).mockResolvedValue({ ...acceptedReq, status: 'PENDING' } as never);
    withProvider(<RentalConversionView requestId="req-1" />);
    expect(await screen.findByText(/can’t be started yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start rental/i })).toBeNull();
    expect(getPublicProperty).not.toHaveBeenCalled();
  });

  it('shows unavailable when the property is not AVAILABLE', async () => {
    vi.mocked(getMyRentalRequest).mockResolvedValue(acceptedReq as never);
    vi.mocked(getPublicProperty).mockResolvedValue({ ...fullProperty, status: 'OCCUPIED' });
    withProvider(<RentalConversionView requestId="req-1" />);
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start rental/i })).toBeNull();
  });

  it('a landlord is blocked from the conversion page', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    withProvider(<RentalConversionView requestId="req-1" />);
    expect(await screen.findByText('Rentals are available to tenants')).toBeInTheDocument();
    expect(getMyRentalRequest).not.toHaveBeenCalled();
  });

  it('submits a correct POST (no identity/money) and shows ACTIVE on success', async () => {
    vi.mocked(getMyRentalRequest).mockResolvedValue(acceptedReq as never);
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    vi.mocked(rentalsApi.createRentalFromRequest).mockResolvedValue(tenantRental());
    withProvider(<RentalConversionView requestId="req-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /start rental/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /start rental/i }));

    await waitFor(() => expect(rentalsApi.createRentalFromRequest).toHaveBeenCalled());
    const [reqId, body] = vi.mocked(rentalsApi.createRentalFromRequest).mock.calls[0]!;
    expect(reqId).toBe('req-1');
    for (const forbidden of ['tenantId', 'landlordId', 'propertyId', 'status', 'monthlyRent']) {
      expect(body).not.toHaveProperty(forbidden);
    }
    expect(await screen.findByText(/rental activated/i)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view rental/i })).toHaveAttribute(
      'href',
      '/rentals/rent-1',
    );
    // Never claims a payment happened.
    expect(screen.queryByText(/payment successful|rent paid|payment received/i)).toBeNull();
  });

  it('handles RENTAL_ALREADY_EXISTS safely (no success claim)', async () => {
    vi.mocked(getMyRentalRequest).mockResolvedValue(acceptedReq as never);
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    vi.mocked(rentalsApi.createRentalFromRequest).mockRejectedValue(
      new ApiRequestError('exists', 'RENTAL_ALREADY_EXISTS', 409),
    );
    withProvider(<RentalConversionView requestId="req-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /start rental/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /start rental/i }));
    expect(await screen.findByText(/already been started as a rental/i)).toBeInTheDocument();
    expect(screen.queryByText(/rental activated/i)).toBeNull();
  });

  it('handles PROPERTY_NOT_AVAILABLE safely', async () => {
    vi.mocked(getMyRentalRequest).mockResolvedValue(acceptedReq as never);
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    vi.mocked(rentalsApi.createRentalFromRequest).mockRejectedValue(
      new ApiRequestError('nope', 'PROPERTY_NOT_AVAILABLE', 409),
    );
    withProvider(<RentalConversionView requestId="req-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /start rental/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /start rental/i }));
    expect(await screen.findByText(/no longer available to rent/i)).toBeInTheDocument();
    expect(screen.queryByText(/rental activated/i)).toBeNull();
  });
});

// ============================================================================
// Tenant rentals list + detail
// ============================================================================
describe('tenant rentals', () => {
  it('renders the tenant’s rentals', async () => {
    vi.mocked(rentalsApi.listMyRentals).mockResolvedValue([tenantRental()]);
    withProvider(<MyRentalsView />);
    expect(await screen.findByText('Sunny Apartment in Remera')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders an empty state with a browse CTA', async () => {
    vi.mocked(rentalsApi.listMyRentals).mockResolvedValue([]);
    withProvider(<MyRentalsView />);
    expect(await screen.findByText(/no rentals yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse properties/i })).toBeInTheDocument();
  });

  it('renders a loading skeleton before data resolves', async () => {
    vi.mocked(rentalsApi.listMyRentals).mockReturnValue(new Promise(() => {}));
    withProvider(<MyRentalsView />);
    expect(await screen.findByText(/loading rentals/i)).toBeInTheDocument();
  });

  it('renders a safe error state on failure', async () => {
    vi.mocked(rentalsApi.listMyRentals).mockRejectedValue(
      new ApiRequestError('x', 'INTERNAL', 500),
    );
    withProvider(<MyRentalsView />);
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders the tenant rental detail with timeline + facts + landlord (no lifecycle)', async () => {
    vi.mocked(rentalsApi.getMyRental).mockResolvedValue(tenantRental());
    withProvider(<MyRentalDetailView id="rent-1" />);
    expect(await screen.findByLabelText(/rental timeline/i)).toBeInTheDocument();
    expect(screen.getByText('Security deposit')).toBeInTheDocument();
    expect(screen.getByText(/Aline M/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete rental|terminate rental/i })).toBeNull();
  });

  // F6 integration: the tenant rental detail links payment by rental status.
  it('shows "Make payment" for an ACTIVE rental', async () => {
    vi.mocked(rentalsApi.getMyRental).mockResolvedValue(tenantRental({ status: 'ACTIVE' }));
    withProvider(<MyRentalDetailView id="rent-1" />);
    const pay = await screen.findByRole('link', { name: /make payment/i });
    expect(pay).toHaveAttribute('href', '/rentals/rent-1/pay');
  });

  it.each(['COMPLETED', 'TERMINATED'] as const)(
    'does not show "Make payment" for a %s rental (history only)',
    async (status) => {
      vi.mocked(rentalsApi.getMyRental).mockResolvedValue(tenantRental({ status }));
      withProvider(<MyRentalDetailView id="rent-1" />);
      await screen.findByText('Rental status');
      expect(screen.queryByRole('link', { name: /make payment/i })).toBeNull();
      expect(screen.getByRole('link', { name: /view payment history/i })).toHaveAttribute(
        'href',
        '/payments',
      );
    },
  );
});

// ============================================================================
// Landlord rentals list + detail + lifecycle
// ============================================================================
describe('landlord rentals', () => {
  it('renders rentals with the tenant name', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rentalsApi.listLandlordRentals).mockResolvedValue([landlordRental()]);
    withProvider(<LandlordRentalsView />);
    expect(await screen.findByText('Sunny Apartment in Remera')).toBeInTheDocument();
    expect(screen.getByText(/Jean Uwimana/)).toBeInTheDocument();
  });

  it('blocks a tenant from the landlord rentals list (wrong role)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
    withProvider(<LandlordRentalsView />);
    expect(await screen.findByText('Rentals is available to landlords')).toBeInTheDocument();
    expect(rentalsApi.listLandlordRentals).not.toHaveBeenCalled();
  });

  it('completes an ACTIVE rental via confirmation (no payment call)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rentalsApi.getLandlordRental).mockResolvedValue(landlordRental({ status: 'ACTIVE' }));
    vi.mocked(rentalsApi.completeRental).mockResolvedValue(landlordRental({ status: 'COMPLETED' }));
    withProvider(<LandlordRentalDetailView id="rent-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /complete rental/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /complete rental/i }));
    await waitFor(() => expect(rentalsApi.completeRental).toHaveBeenCalledWith('rent-1'));
    await waitFor(() => expect(screen.getAllByText('Completed').length).toBeGreaterThan(0));
    expect(screen.getByText(/property is now available/i)).toBeInTheDocument();
  });

  it('terminates an ACTIVE rental via confirmation', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rentalsApi.getLandlordRental).mockResolvedValue(landlordRental({ status: 'ACTIVE' }));
    vi.mocked(rentalsApi.terminateRental).mockResolvedValue(
      landlordRental({ status: 'TERMINATED' }),
    );
    withProvider(<LandlordRentalDetailView id="rent-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /terminate rental/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /terminate rental/i }));
    await waitFor(() => expect(rentalsApi.terminateRental).toHaveBeenCalledWith('rent-1'));
    await waitFor(() => expect(screen.getAllByText('Terminated').length).toBeGreaterThan(0));
  });

  it('hides lifecycle actions for a terminal rental', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rentalsApi.getLandlordRental).mockResolvedValue(
      landlordRental({ status: 'COMPLETED' }),
    );
    withProvider(<LandlordRentalDetailView id="rent-1" />);
    expect((await screen.findAllByText('Completed')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /complete rental|terminate rental/i })).toBeNull();
  });

  it('re-syncs authoritative state on a lifecycle conflict (409)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rentalsApi.getLandlordRental).mockResolvedValue(landlordRental({ status: 'ACTIVE' }));
    vi.mocked(rentalsApi.completeRental).mockRejectedValue(
      new ApiRequestError('nope', 'RENTAL_NOT_ACTIVE', 409),
    );
    withProvider(<LandlordRentalDetailView id="rent-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /complete rental/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /complete rental/i }));
    await waitFor(() => expect(rentalsApi.completeRental).toHaveBeenCalled());
    await waitFor(() => expect(rentalsApi.getLandlordRental).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
  });
});
