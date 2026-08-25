import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Control usePathname/useRouter so we can assert the exact returnTo redirect.
const replace = vi.fn();
const pathname = vi.fn(() => '/landlord/rentals');
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => pathname(),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('@/lib/auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth')>();
  return { ...actual, fetchCurrentUser: vi.fn(), logoutRequest: vi.fn() };
});

import * as authApi from '@/lib/auth';
import { AuthProvider } from '@/components/auth/auth-provider';
import { RequireAuth } from '@/components/auth/require-auth';
import { RequireRole } from '@/components/auth/require-role';
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
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const landlord: AuthUser = { ...tenant, id: 'l1', role: 'LANDLORD' };

beforeEach(() => {
  pathname.mockReturnValue('/landlord/rentals');
});
afterEach(() => vi.clearAllMocks());

const renderGuarded = (ui: React.ReactNode) => render(<AuthProvider>{ui}</AuthProvider>);
const Secret = () => <div>protected content</div>;

// ============================================================================
// RequireRole — the guard behind every role-scoped page
// ============================================================================
describe('authorization matrix — RequireRole', () => {
  it('renders children for the matching role', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    renderGuarded(
      <RequireRole role="LANDLORD">
        <Secret />
      </RequireRole>,
    );
    expect(await screen.findByText('protected content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('blocks the wrong role with a safe forbidden state (no redirect, no data)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant); // tenant hitting a LANDLORD page
    renderGuarded(
      <RequireRole role="LANDLORD">
        <Secret />
      </RequireRole>,
    );
    expect(await screen.findByText(/available to landlords/i)).toBeInTheDocument();
    expect(screen.queryByText('protected content')).toBeNull();
    expect(replace).not.toHaveBeenCalled(); // wrong role is forbidden, not redirected
  });

  it('blocks a landlord from a TENANT-only page', async () => {
    pathname.mockReturnValue('/rentals');
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
    renderGuarded(
      <RequireRole role="TENANT">
        <Secret />
      </RequireRole>,
    );
    expect(await screen.findByText(/available to tenants/i)).toBeInTheDocument();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('redirects an anonymous user to login with a safe returnTo', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);
    renderGuarded(
      <RequireRole role="LANDLORD">
        <Secret />
      </RequireRole>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/login?returnTo=%2Flandlord%2Frentals'),
    );
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('shows a loading state (never the children) while auth resolves', () => {
    vi.mocked(authApi.fetchCurrentUser).mockReturnValue(new Promise(() => {})); // never resolves
    renderGuarded(
      <RequireRole role="LANDLORD">
        <Secret />
      </RequireRole>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).toBeNull();
  });
});

// ============================================================================
// RequireAuth — both roles allowed, anonymous redirected
// ============================================================================
describe('authorization matrix — RequireAuth', () => {
  it('allows any authenticated user', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
    renderGuarded(
      <RequireAuth>
        <Secret />
      </RequireAuth>,
    );
    expect(await screen.findByText('protected content')).toBeInTheDocument();
  });

  it('redirects an anonymous user to login', async () => {
    pathname.mockReturnValue('/notifications');
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);
    renderGuarded(
      <RequireAuth>
        <Secret />
      </RequireAuth>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?returnTo=%2Fnotifications'));
    expect(screen.queryByText('protected content')).toBeNull();
  });
});
