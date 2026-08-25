import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock auth so the AuthProvider hydrates to a chosen role.
vi.mock('@/lib/auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth')>();
  return { ...actual, fetchCurrentUser: vi.fn(), logoutRequest: vi.fn() };
});
// Mock payment + rental data access (no real network).
vi.mock('@/lib/payments', () => ({
  createPayment: vi.fn(),
  listMyPayments: vi.fn(),
  getMyPayment: vi.fn(),
  listLandlordPayments: vi.fn(),
  getLandlordPayment: vi.fn(),
}));
vi.mock('@/lib/rentals', () => ({ getMyRental: vi.fn() }));

import * as authApi from '@/lib/auth';
import * as payApi from '@/lib/payments';
import { getMyRental } from '@/lib/rentals';
import { AuthProvider } from '@/components/auth/auth-provider';
import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import { PaymentCreateView } from '@/components/payments/payment-create-view';
import { MyPaymentsView } from '@/components/payments/my-payments-view';
import { MyPaymentDetailView } from '@/components/payments/my-payment-detail-view';
import { LandlordPaymentsView } from '@/components/payments/landlord-payments-view';
import { LandlordPaymentDetailView } from '@/components/payments/landlord-payment-detail-view';
import { ApiRequestError } from '@/lib/api';
import type { AuthUser } from '@/types/auth';
import type { LandlordPayment, TenantPayment } from '@/types/payment';
import type { TenantRental } from '@/types/rental';

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

const rentalProp = {
  id: 'prop-1',
  title: 'Sunny Apartment',
  propertyType: 'APARTMENT',
  district: 'Gasabo',
  sector: 'Remera',
  status: 'OCCUPIED',
};
const payProp = {
  id: 'prop-1',
  title: 'Sunny Apartment',
  propertyType: 'APARTMENT',
  district: 'Gasabo',
  sector: 'Remera',
};

const rental = (over: Partial<TenantRental> = {}): TenantRental => ({
  id: 'rent-1',
  propertyId: 'prop-1',
  rentalRequestId: 'req-1',
  status: 'ACTIVE',
  startDate: '2026-08-01T00:00:00.000Z',
  endDate: null,
  monthlyRent: 300000,
  securityDeposit: 250000,
  currency: 'RWF',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  property: rentalProp,
  landlord: { id: 'l1', firstName: 'Aline', lastName: 'M' },
  ...over,
});

const tenantPayment = (over: Partial<TenantPayment> = {}): TenantPayment => ({
  id: 'pay-1',
  rentalId: 'rent-1',
  propertyId: 'prop-1',
  amount: 300000,
  currency: 'RWF',
  paymentPeriod: '2026-08',
  provider: 'MTN_MOMO',
  providerTransactionId: null,
  status: 'PENDING',
  createdAt: '2026-08-20T00:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-08-20T00:00:00.000Z',
  property: payProp,
  landlord: { id: 'l1', firstName: 'Aline', lastName: 'M' },
  ...over,
});

const landlordPayment = (over: Partial<LandlordPayment> = {}): LandlordPayment => ({
  id: 'pay-1',
  rentalId: 'rent-1',
  propertyId: 'prop-1',
  amount: 300000,
  currency: 'RWF',
  paymentPeriod: '2026-08',
  provider: 'MTN_MOMO',
  providerTransactionId: null,
  status: 'PENDING',
  createdAt: '2026-08-20T00:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-08-20T00:00:00.000Z',
  property: payProp,
  tenant: { id: 't1', firstName: 'Jean', lastName: 'Uwimana' },
  ...over,
});

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
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

// Drive the payment form to the confirm step and submit.
async function submitPayment() {
  fireEvent.click(await screen.findByRole('button', { name: /review payment/i }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /^pay /i }));
}

// ============================================================================
// Status badge
// ============================================================================
describe('payment status badge', () => {
  it('renders each status with icon + text', () => {
    const { rerender } = render(<PaymentStatusBadge status="PENDING" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    for (const [s, label] of [
      ['SUCCESSFUL', 'Successful'],
      ['FAILED', 'Failed'],
      ['CANCELLED', 'Cancelled'],
      ['EXPIRED', 'Expired'],
    ] as const) {
      rerender(<PaymentStatusBadge status={s} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

// ============================================================================
// Payment creation
// ============================================================================
describe('payment creation', () => {
  it('an active rental shows the payment form with rental context', async () => {
    vi.mocked(getMyRental).mockResolvedValue(rental());
    withProvider(<PaymentCreateView rentalId="rent-1" />);
    expect(await screen.findByRole('button', { name: /review payment/i })).toBeInTheDocument();
    expect(screen.getAllByText(/RWF 300,000/).length).toBeGreaterThan(0);
    // MTN selectable; Airtel present but disabled.
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    const airtel = screen.getByRole('radio', { name: /airtel money/i });
    expect(airtel).toBeDisabled();
  });

  it('does not offer payment for a completed rental', async () => {
    vi.mocked(getMyRental).mockResolvedValue(rental({ status: 'COMPLETED' }));
    withProvider(<PaymentCreateView rentalId="rent-1" />);
    expect(
      await screen.findByText(/payments are unavailable for this rental/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review payment/i })).toBeNull();
  });

  it('does not offer payment for a terminated rental', async () => {
    vi.mocked(getMyRental).mockResolvedValue(rental({ status: 'TERMINATED' }));
    withProvider(<PaymentCreateView rentalId="rent-1" />);
    expect(
      await screen.findByText(/payments are unavailable for this rental/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review payment/i })).toBeNull();
  });

  it('blocks a landlord from the payment page', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    withProvider(<PaymentCreateView rentalId="rent-1" />);
    expect(await screen.findByText('Payments are available to tenants')).toBeInTheDocument();
    expect(getMyRental).not.toHaveBeenCalled();
  });

  it('disables review for an over-rent amount and keeps the value', async () => {
    vi.mocked(getMyRental).mockResolvedValue(rental());
    withProvider(<PaymentCreateView rentalId="rent-1" />);
    const amount = await screen.findByLabelText(/amount to pay/i);
    fireEvent.change(amount, { target: { value: '400000' } });
    expect(screen.getByRole('button', { name: /review payment/i })).toBeDisabled();
    expect(amount).toHaveValue(400000); // value preserved after validation failure
  });

  it('submits the correct body + Idempotency-Key and shows PENDING (never SUCCESSFUL)', async () => {
    vi.mocked(getMyRental).mockResolvedValue(rental());
    vi.mocked(payApi.createPayment).mockResolvedValue(tenantPayment());
    withProvider(<PaymentCreateView rentalId="rent-1" />);
    await submitPayment();

    await waitFor(() => expect(payApi.createPayment).toHaveBeenCalledTimes(1));
    const [body, key] = vi.mocked(payApi.createPayment).mock.calls[0]!;
    expect(body).toEqual({
      rentalId: 'rent-1',
      amount: 300000,
      paymentPeriod: expect.stringMatching(/^\d{4}-\d{2}$/),
      provider: 'MTN_MOMO',
    });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThanOrEqual(8);
    for (const forbidden of ['tenantId', 'landlordId', 'propertyId', 'status']) {
      expect(body).not.toHaveProperty(forbidden);
    }
    expect(await screen.findByText(/payment initiated/i)).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByText(/payment successful/i)).toBeNull();
  });

  it('handles a 409 idempotency reuse safely', async () => {
    vi.mocked(getMyRental).mockResolvedValue(rental());
    vi.mocked(payApi.createPayment).mockRejectedValue(
      new ApiRequestError('reuse', 'IDEMPOTENCY_KEY_REUSED', 409),
    );
    withProvider(<PaymentCreateView rentalId="rent-1" />);
    await submitPayment();
    expect(await screen.findByText(/already started with different details/i)).toBeInTheDocument();
    expect(screen.queryByText(/payment initiated/i)).toBeNull();
  });

  it('on a 504 timeout does not create a second payment and shows an uncertain state', async () => {
    vi.mocked(getMyRental).mockResolvedValue(rental());
    vi.mocked(payApi.createPayment).mockRejectedValue(
      new ApiRequestError('timeout', 'PAYMENT_PROVIDER_TIMEOUT', 504),
    );
    withProvider(<PaymentCreateView rentalId="rent-1" />);
    await submitPayment();
    expect(await screen.findByText(/could not be confirmed yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /check payment status/i })).toHaveAttribute(
      'href',
      '/payments',
    );
    // Critical: no automatic second attempt.
    expect(payApi.createPayment).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Tenant payment history + detail
// ============================================================================
describe('tenant payments', () => {
  it('renders the payment list', async () => {
    vi.mocked(payApi.listMyPayments).mockResolvedValue([tenantPayment()]);
    withProvider(<MyPaymentsView />);
    expect(await screen.findByText('Sunny Apartment')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    vi.mocked(payApi.listMyPayments).mockResolvedValue([]);
    withProvider(<MyPaymentsView />);
    expect(await screen.findByText(/no payments yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view my rentals/i })).toBeInTheDocument();
  });

  it('renders a loading skeleton', async () => {
    vi.mocked(payApi.listMyPayments).mockReturnValue(new Promise(() => {}));
    withProvider(<MyPaymentsView />);
    expect(await screen.findByText(/loading payments/i)).toBeInTheDocument();
  });

  it('renders a safe error state', async () => {
    vi.mocked(payApi.listMyPayments).mockRejectedValue(new ApiRequestError('x', 'INTERNAL', 500));
    withProvider(<MyPaymentsView />);
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows PENDING detail with a working refresh', async () => {
    vi.mocked(payApi.getMyPayment).mockResolvedValue(tenantPayment({ status: 'PENDING' }));
    withProvider(<MyPaymentDetailView id="pay-1" />);
    expect(await screen.findByText(/waiting for confirmation/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /refresh status/i }));
    await waitFor(() => expect(payApi.getMyPayment).toHaveBeenCalledTimes(2));
  });

  it('shows a SUCCESSFUL receipt with reference (no refresh)', async () => {
    vi.mocked(payApi.getMyPayment).mockResolvedValue(
      tenantPayment({
        status: 'SUCCESSFUL',
        completedAt: '2026-08-20T01:00:00.000Z',
        providerTransactionId: 'ref-abc',
      }),
    );
    withProvider(<MyPaymentDetailView id="pay-1" />);
    expect(await screen.findByText(/payment successful/i)).toBeInTheDocument();
    expect(screen.getByText('ref-abc')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh status/i })).toBeNull();
  });

  it('shows a FAILED detail with a retry link to a fresh payment', async () => {
    vi.mocked(payApi.getMyPayment).mockResolvedValue(tenantPayment({ status: 'FAILED' }));
    withProvider(<MyPaymentDetailView id="pay-1" />);
    expect(await screen.findByText(/payment failed/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/rentals/rent-1/pay',
    );
  });
});

// ============================================================================
// Landlord payments
// ============================================================================
describe('landlord payments', () => {
  it('renders payments with the tenant name', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(payApi.listLandlordPayments).mockResolvedValue([landlordPayment()]);
    withProvider(<LandlordPaymentsView />);
    expect(await screen.findByText('Sunny Apartment')).toBeInTheDocument();
    expect(screen.getByText(/Jean Uwimana/)).toBeInTheDocument();
  });

  it('blocks a tenant from the landlord payments list', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
    withProvider(<LandlordPaymentsView />);
    expect(await screen.findByText('Payments are available to landlords')).toBeInTheDocument();
    expect(payApi.listLandlordPayments).not.toHaveBeenCalled();
  });

  it('renders landlord payment detail with no mutation controls', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    vi.mocked(payApi.getLandlordPayment).mockResolvedValue(
      landlordPayment({ status: 'SUCCESSFUL' }),
    );
    withProvider(<LandlordPaymentDetailView id="pay-1" />);
    expect(await screen.findByText(/payment successful/i)).toBeInTheDocument();
    expect(screen.getByText(/Jean Uwimana/)).toBeInTheDocument();
    // No status-changing controls exist for a landlord.
    expect(screen.queryByRole('button', { name: /refresh|complete|cancel|mark/i })).toBeNull();
  });
});
