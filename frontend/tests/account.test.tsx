import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Local next/navigation mock so we can control usePathname for active-state tests.
const push = vi.fn();
const replace = vi.fn();
const usePathnameMock = vi.fn(() => '/account');
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => usePathnameMock(),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('@/lib/auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth')>();
  return { ...actual, fetchCurrentUser: vi.fn(), logoutRequest: vi.fn() };
});
vi.mock('@/lib/profile', () => ({ getMyProfile: vi.fn(), updateMyProfile: vi.fn() }));

import * as authApi from '@/lib/auth';
import * as profileApi from '@/lib/profile';
import { AuthProvider, useAuth } from '@/components/auth/auth-provider';
import { AccountOverview } from '@/components/account/account-overview';
import { ProfileView } from '@/components/account/profile-view';
import { ProfileForm } from '@/components/account/profile-form';
import { SecurityView } from '@/components/account/security-view';
import { UserAvatar } from '@/components/account/user-avatar';
import { ApiRequestError } from '@/lib/api';
import type { AuthUser } from '@/types/auth';

const tenant: AuthUser = {
  id: 't1',
  role: 'TENANT',
  firstName: 'Jean',
  lastName: 'Uwimana',
  email: 'jean@example.rw',
  phone: '+250788123456',
  profileImageKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};
const landlord: AuthUser = {
  ...tenant,
  id: 'l1',
  role: 'LANDLORD',
  firstName: 'Aline',
  lastName: 'M',
};

beforeEach(() => {
  usePathnameMock.mockReturnValue('/account');
  vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
});
afterEach(() => vi.clearAllMocks());

const withProvider = (ui: React.ReactNode) => render(<AuthProvider>{ui}</AuthProvider>);

// ============================================================================
// Avatar
// ============================================================================
describe('user avatar', () => {
  it('renders initials from first + last name', () => {
    render(<UserAvatar firstName="Amara" lastName="Niyonzima" />);
    expect(screen.getByText('AN')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /amara niyonzima/i })).toBeInTheDocument();
  });
});

// ============================================================================
// Account overview
// ============================================================================
describe('account overview', () => {
  it('renders the authenticated user’s profile summary', async () => {
    withProvider(<AccountOverview />);
    expect(await screen.findByRole('heading', { name: /Jean Uwimana/ })).toBeInTheDocument();
    expect(screen.getByText('jean@example.rw')).toBeInTheDocument();
    expect(screen.getByText('+250788123456')).toBeInTheDocument();
    expect(screen.getByText('Tenant')).toBeInTheDocument();
    expect(screen.getByText(/member since/i)).toBeInTheDocument();
  });

  it('shows tenant navigation and no landlord paths', async () => {
    withProvider(<AccountOverview />);
    await screen.findByRole('heading', { name: /Jean Uwimana/ });
    expect(screen.getByRole('link', { name: 'My requests' })).toHaveAttribute('href', '/requests');
    expect(screen.getByRole('link', { name: 'My rentals' })).toHaveAttribute('href', '/rentals');
    expect(screen.queryByRole('link', { name: /landlord/i })).toBeNull();
    // No link should point to a /landlord/* path.
    const landlordLinks = screen
      .getAllByRole('link')
      .filter((a) => (a.getAttribute('href') || '').startsWith('/landlord/'));
    expect(landlordLinks).toHaveLength(0);
  });

  it('shows landlord navigation for a landlord', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    withProvider(<AccountOverview />);
    await screen.findByRole('heading', { name: /Aline M/ });
    expect(screen.getByRole('link', { name: 'Rental requests' })).toHaveAttribute(
      'href',
      '/landlord/requests',
    );
    expect(screen.getByRole('link', { name: 'Rentals' })).toHaveAttribute(
      'href',
      '/landlord/rentals',
    );
    const tenantLeak = screen
      .getAllByRole('link')
      .filter((a) => ['/requests', '/rentals'].includes(a.getAttribute('href') || ''));
    expect(tenantLeak).toHaveLength(0);
  });

  it('marks the active account nav item with aria-current', async () => {
    usePathnameMock.mockReturnValue('/account/profile');
    withProvider(<AccountOverview />);
    const nav = await screen.findByRole('navigation', { name: 'Account' });
    const editLink = within(nav).getByRole('link', { name: 'Edit profile' });
    expect(editLink).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('redirects anonymous users away from the account page', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);
    withProvider(<AccountOverview />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?returnTo=%2Faccount'));
  });
});

// ============================================================================
// Profile form
// ============================================================================
describe('profile form', () => {
  function Probe() {
    const { user } = useAuth();
    return <span data-testid="hdr-name">{user?.firstName}</span>;
  }

  it('loads current values; email and role are read-only', () => {
    render(
      <AuthProvider>
        <ProfileForm user={tenant} />
      </AuthProvider>,
    );
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Jean');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Uwimana');
    expect(screen.getByLabelText(/^phone/i)).toHaveValue('+250788123456');
    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveValue('jean@example.rw');
    expect(email).toBeDisabled();
    // Role is shown as a badge, not an editable control.
    expect(screen.getByText('Tenant')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /role/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /role/i })).toBeNull();
  });

  it('disables Save with no changes and issues no PATCH', () => {
    render(
      <AuthProvider>
        <ProfileForm user={tenant} />
      </AuthProvider>,
    );
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.getByText(/no changes to save/i)).toBeInTheDocument();
    expect(profileApi.updateMyProfile).not.toHaveBeenCalled();
  });

  it('sends ONLY the changed field on save', async () => {
    vi.mocked(profileApi.updateMyProfile).mockResolvedValue({ ...tenant, firstName: 'Jeanette' });
    render(
      <AuthProvider>
        <ProfileForm user={tenant} />
      </AuthProvider>,
    );
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jeanette' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(profileApi.updateMyProfile).toHaveBeenCalledWith({ firstName: 'Jeanette' }),
    );
    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
  });

  it('updates the AuthProvider user (header reflects the new name)', async () => {
    vi.mocked(profileApi.updateMyProfile).mockResolvedValue({ ...tenant, firstName: 'Jeanette' });
    render(
      <AuthProvider>
        <Probe />
        <ProfileForm user={tenant} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hdr-name')).toHaveTextContent('Jean'));
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jeanette' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(screen.getByTestId('hdr-name')).toHaveTextContent('Jeanette'));
  });

  it('maps a duplicate-phone conflict to safe copy', async () => {
    vi.mocked(profileApi.updateMyProfile).mockRejectedValue(
      new ApiRequestError('dup', 'PHONE_ALREADY_IN_USE', 409),
    );
    render(
      <AuthProvider>
        <ProfileForm user={tenant} />
      </AuthProvider>,
    );
    fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '+250788999999' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/already associated with another account/i)).toBeInTheDocument();
  });

  it('does not offer any profile-image upload control', () => {
    const { container } = render(
      <AuthProvider>
        <ProfileForm user={tenant} />
      </AuthProvider>,
    );
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/upload/i)).toBeNull();
  });
});

// ============================================================================
// Profile view + security
// ============================================================================
describe('profile & security pages', () => {
  it('profile page renders the form for the authenticated user', async () => {
    withProvider(<ProfileView />);
    expect(await screen.findByLabelText(/first name/i)).toHaveValue('Jean');
  });

  it('security page shows change-password and a forgot-password link', async () => {
    withProvider(<SecurityView />);
    expect(await screen.findByRole('button', { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reset it instead/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});
