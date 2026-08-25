import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock auth data access so the AuthProvider hydrates to a chosen role.
vi.mock('@/lib/auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth')>();
  return { ...actual, fetchCurrentUser: vi.fn(), logoutRequest: vi.fn() };
});
// Mock rental-request + property data access (no real network in unit tests).
vi.mock('@/lib/rental-requests', () => ({
  createRentalRequest: vi.fn(),
  listMyRentalRequests: vi.fn(),
  getMyRentalRequest: vi.fn(),
  cancelMyRentalRequest: vi.fn(),
  listLandlordRentalRequests: vi.fn(),
  getLandlordRentalRequest: vi.fn(),
  approveRentalRequest: vi.fn(),
  rejectRentalRequest: vi.fn(),
}));
vi.mock('@/lib/properties', () => ({ getPublicProperty: vi.fn() }));

import * as authApi from '@/lib/auth';
import * as rr from '@/lib/rental-requests';
import { getPublicProperty } from '@/lib/properties';
import { AuthProvider } from '@/components/auth/auth-provider';
import { MobileNav } from '@/components/layout/mobile-nav';
import { RentalRequestStatusBadge } from '@/components/rental-requests/rental-request-status-badge';
import { RentalRequestCreateView } from '@/components/rental-requests/rental-request-create-view';
import { MyRequestsView } from '@/components/rental-requests/my-requests-view';
import { MyRequestDetailView } from '@/components/rental-requests/my-request-detail-view';
import { LandlordRequestsView } from '@/components/rental-requests/landlord-requests-view';
import { LandlordRequestDetailView } from '@/components/rental-requests/landlord-request-detail-view';
import { ApiRequestError } from '@/lib/api';
import type { AuthUser } from '@/types/auth';
import type {
  LandlordRentalRequest,
  RequestPropertySummary,
  TenantRentalRequest,
} from '@/types/rental-request';
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

const propertySummary: RequestPropertySummary = {
  id: 'prop-1',
  title: 'Sunny Apartment in Remera',
  propertyType: 'APARTMENT',
  monthlyRent: 300000,
  currency: 'RWF',
  district: 'Gasabo',
  sector: 'Remera',
  status: 'AVAILABLE',
  isPublished: true,
};

const fullProperty: PublicProperty = {
  id: 'prop-1',
  title: 'Sunny Apartment in Remera',
  description: 'Bright and airy.',
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

const tenantRequest = (over: Partial<TenantRentalRequest> = {}): TenantRentalRequest => ({
  id: 'req-1',
  propertyId: 'prop-1',
  status: 'PENDING',
  message: 'Hello there',
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
  property: propertySummary,
  ...over,
});

const landlordRequest = (over: Partial<LandlordRentalRequest> = {}): LandlordRentalRequest => ({
  id: 'req-1',
  propertyId: 'prop-1',
  status: 'PENDING',
  message: 'Hello there',
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
  property: propertySummary,
  tenant: { id: 't1', firstName: 'Jean', lastName: 'Uwimana' },
  ...over,
});

let replace: ReturnType<typeof vi.fn>;

beforeEach(() => {
  replace = vi.fn();
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
    replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant); // default: tenant
});
afterEach(() => vi.clearAllMocks());

const withProvider = (ui: React.ReactNode) => render(<AuthProvider>{ui}</AuthProvider>);

// ============================================================================
// Status badges
// ============================================================================
describe('rental request status badge', () => {
  it('renders each status with icon + text', () => {
    const { rerender } = render(<RentalRequestStatusBadge status="PENDING" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    rerender(<RentalRequestStatusBadge status="ACCEPTED" />);
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    rerender(<RentalRequestStatusBadge status="REJECTED" />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    rerender(<RentalRequestStatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});

// ============================================================================
// Tenant request creation
// ============================================================================
describe('rental request creation', () => {
  it('a tenant reaches the request form and it loads the property', async () => {
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    withProvider(<RentalRequestCreateView propertyId="prop-1" />);
    expect(await screen.findByText('Sunny Apartment in Remera')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send request/i })).toBeInTheDocument();
  });

  it('a landlord sees a safe role message and no request form', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    withProvider(<RentalRequestCreateView propertyId="prop-1" />);
    expect(await screen.findByText(/available to tenants/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send request/i })).toBeNull();
    expect(getPublicProperty).not.toHaveBeenCalled();
  });

  it('submits a correct POST body without any tenant identity', async () => {
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    vi.mocked(rr.createRentalRequest).mockResolvedValue(tenantRequest());
    withProvider(<RentalRequestCreateView propertyId="prop-1" />);
    fireEvent.change(await screen.findByLabelText(/message to the landlord/i), {
      target: { value: 'Hi there' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));

    await waitFor(() => expect(rr.createRentalRequest).toHaveBeenCalled());
    const call = vi.mocked(rr.createRentalRequest).mock.calls[0];
    if (!call) throw new Error('createRentalRequest was not called');
    const arg = call[0];
    expect(arg.propertyId).toBe('prop-1');
    expect(arg.message).toBe('Hi there');
    for (const forbidden of ['tenantId', 'landlordId', 'status', 'id', 'requesterId']) {
      expect(arg).not.toHaveProperty(forbidden);
    }
  });

  it('shows a PENDING confirmation on success (never "confirmed")', async () => {
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    vi.mocked(rr.createRentalRequest).mockResolvedValue(tenantRequest());
    withProvider(<RentalRequestCreateView propertyId="prop-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /send request/i }));
    expect(await screen.findByText(/rental request sent/i)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view my requests/i })).toHaveAttribute(
      'href',
      '/requests',
    );
    expect(screen.queryByText(/rental confirmed|confirmed/i)).toBeNull();
  });

  it('shows a safe message on a duplicate (409) request', async () => {
    vi.mocked(getPublicProperty).mockResolvedValue(fullProperty);
    vi.mocked(rr.createRentalRequest).mockRejectedValue(
      new ApiRequestError('exists', 'RENTAL_REQUEST_ALREADY_EXISTS', 409),
    );
    withProvider(<RentalRequestCreateView propertyId="prop-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /send request/i }));
    expect(await screen.findByText(/already have an active request/i)).toBeInTheDocument();
  });

  it('explains when the property is not available (no form)', async () => {
    vi.mocked(getPublicProperty).mockResolvedValue({ ...fullProperty, status: 'OCCUPIED' });
    withProvider(<RentalRequestCreateView propertyId="prop-1" />);
    expect(await screen.findByText(/can’t be requested right now/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send request/i })).toBeNull();
  });

  it('explains when the property no longer exists', async () => {
    vi.mocked(getPublicProperty).mockResolvedValue(null);
    withProvider(<RentalRequestCreateView propertyId="prop-1" />);
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Tenant list + detail + cancel
// ============================================================================
describe('tenant requests list', () => {
  it('renders the tenant’s requests', async () => {
    vi.mocked(rr.listMyRentalRequests).mockResolvedValue([tenantRequest()]);
    withProvider(<MyRequestsView />);
    expect(await screen.findByText('Sunny Apartment in Remera')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders an empty state with a browse CTA', async () => {
    vi.mocked(rr.listMyRentalRequests).mockResolvedValue([]);
    withProvider(<MyRequestsView />);
    expect(await screen.findByText(/no rental requests yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse properties/i })).toBeInTheDocument();
  });

  it('renders a loading skeleton before data resolves', async () => {
    vi.mocked(rr.listMyRentalRequests).mockReturnValue(new Promise(() => {}));
    withProvider(<MyRequestsView />);
    expect(await screen.findByText(/loading requests/i)).toBeInTheDocument();
  });

  it('renders a safe error state on failure', async () => {
    vi.mocked(rr.listMyRentalRequests).mockRejectedValue(
      new ApiRequestError('boom', 'INTERNAL', 500),
    );
    withProvider(<MyRequestsView />);
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('tenant request detail + cancel', () => {
  it('renders the detail with a timeline and dates', async () => {
    vi.mocked(rr.getMyRentalRequest).mockResolvedValue(tenantRequest());
    withProvider(<MyRequestDetailView id="req-1" />);
    expect(await screen.findByText(/request status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/request timeline/i)).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('cancels a PENDING request via confirmation and reflects CANCELLED', async () => {
    vi.mocked(rr.getMyRentalRequest).mockResolvedValue(tenantRequest({ status: 'PENDING' }));
    vi.mocked(rr.cancelMyRentalRequest).mockResolvedValue(tenantRequest({ status: 'CANCELLED' }));
    withProvider(<MyRequestDetailView id="req-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^cancel request$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel request$/i }));
    await waitFor(() => expect(rr.cancelMyRentalRequest).toHaveBeenCalledWith('req-1'));
    await waitFor(() => expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0));
  });

  it('does not offer cancellation for a terminal request', async () => {
    vi.mocked(rr.getMyRentalRequest).mockResolvedValue(tenantRequest({ status: 'ACCEPTED' }));
    withProvider(<MyRequestDetailView id="req-1" />);
    expect((await screen.findAllByText('Accepted')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /cancel request/i })).toBeNull();
  });

  it('re-syncs authoritative state on a cancel conflict (409)', async () => {
    vi.mocked(rr.getMyRentalRequest).mockResolvedValue(tenantRequest({ status: 'PENDING' }));
    vi.mocked(rr.cancelMyRentalRequest).mockRejectedValue(
      new ApiRequestError('processed', 'RENTAL_REQUEST_CANNOT_BE_CANCELLED', 409),
    );
    withProvider(<MyRequestDetailView id="req-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^cancel request$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel request$/i }));
    await waitFor(() => expect(rr.cancelMyRentalRequest).toHaveBeenCalled());
    // Initial load + reload after the conflict.
    await waitFor(() => expect(rr.getMyRentalRequest).toHaveBeenCalledTimes(2));
    expect(await within(dialog).findByText(/no longer be cancelled/i)).toBeInTheDocument();
  });

  // F5 integration: the request detail links an ACCEPTED request to conversion.
  it('shows "Continue to rental" only for an ACCEPTED request', async () => {
    vi.mocked(rr.getMyRentalRequest).mockResolvedValue(tenantRequest({ status: 'ACCEPTED' }));
    withProvider(<MyRequestDetailView id="req-1" />);
    const link = await screen.findByRole('link', { name: /continue to rental/i });
    expect(link).toHaveAttribute('href', '/requests/req-1/rental');
  });

  it.each(['PENDING', 'REJECTED', 'CANCELLED'] as const)(
    'does not show "Continue to rental" for a %s request',
    async (status) => {
      vi.mocked(rr.getMyRentalRequest).mockResolvedValue(tenantRequest({ status }));
      withProvider(<MyRequestDetailView id="req-1" />);
      await screen.findByText(/request status/i);
      expect(screen.queryByRole('link', { name: /continue to rental/i })).toBeNull();
    },
  );
});

// ============================================================================
// Landlord list + detail + approve/reject
// ============================================================================
describe('landlord requests', () => {
  it('renders incoming requests with the tenant name', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rr.listLandlordRentalRequests).mockResolvedValue([landlordRequest()]);
    withProvider(<LandlordRequestsView />);
    expect(await screen.findByText('Sunny Apartment in Remera')).toBeInTheDocument();
    expect(screen.getByText(/Jean Uwimana/)).toBeInTheDocument();
  });

  it('blocks a tenant from the landlord list (wrong role)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
    withProvider(<LandlordRequestsView />);
    expect(
      await screen.findByText('Rental requests is available to landlords'),
    ).toBeInTheDocument();
    expect(rr.listLandlordRentalRequests).not.toHaveBeenCalled();
  });

  it('renders the landlord detail and approves a PENDING request (no rental creation)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rr.getLandlordRentalRequest).mockResolvedValue(
      landlordRequest({ status: 'PENDING' }),
    );
    vi.mocked(rr.approveRentalRequest).mockResolvedValue(landlordRequest({ status: 'ACCEPTED' }));
    withProvider(<LandlordRequestDetailView id="req-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /approve request/i }));
    await waitFor(() => expect(rr.approveRentalRequest).toHaveBeenCalledWith('req-1'));
    expect(await screen.findByText(/was accepted/i)).toBeInTheDocument();
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0);
    expect(rr.createRentalRequest).not.toHaveBeenCalled();
  });

  it('rejects a PENDING request via confirmation (no rental creation)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rr.getLandlordRentalRequest).mockResolvedValue(
      landlordRequest({ status: 'PENDING' }),
    );
    vi.mocked(rr.rejectRentalRequest).mockResolvedValue(landlordRequest({ status: 'REJECTED' }));
    withProvider(<LandlordRequestDetailView id="req-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /reject request/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /reject request/i }));
    await waitFor(() => expect(rr.rejectRentalRequest).toHaveBeenCalledWith('req-1'));
    await waitFor(() => expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0));
    expect(rr.createRentalRequest).not.toHaveBeenCalled();
  });

  it('re-syncs on an approve conflict (already processed)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(rr.getLandlordRentalRequest).mockResolvedValue(
      landlordRequest({ status: 'PENDING' }),
    );
    vi.mocked(rr.approveRentalRequest).mockRejectedValue(
      new ApiRequestError('processed', 'RENTAL_REQUEST_ALREADY_PROCESSED', 409),
    );
    withProvider(<LandlordRequestDetailView id="req-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /approve request/i }));
    await waitFor(() => expect(rr.approveRentalRequest).toHaveBeenCalled());
    await waitFor(() => expect(rr.getLandlordRentalRequest).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/already been processed/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Role-appropriate navigation
// ============================================================================
describe('mobile navigation request links', () => {
  it('shows "My requests" for a tenant', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
    withProvider(<MobileNav />);
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'My requests' })).toHaveAttribute(
      'href',
      '/requests',
    );
  });

  it('shows "Rental requests" for a landlord', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    withProvider(<MobileNav />);
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Rental requests' })).toHaveAttribute(
      'href',
      '/landlord/requests',
    );
  });
});
