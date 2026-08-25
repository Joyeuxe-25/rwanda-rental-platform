import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the request functions; keep `safeInternalPath` real.
vi.mock('@/lib/auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth')>();
  return {
    ...actual,
    fetchCurrentUser: vi.fn(),
    loginRequest: vi.fn(),
    registerRequest: vi.fn(),
    logoutRequest: vi.fn(),
    changePasswordRequest: vi.fn(),
    forgotPasswordRequest: vi.fn(),
    resetPasswordRequest: vi.fn(),
  };
});

import * as authApi from '@/lib/auth';
import { AuthNav } from '@/components/auth/auth-nav';
import { AuthProvider, useAuth } from '@/components/auth/auth-provider';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { RequireAuth } from '@/components/auth/require-auth';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { MobileNav } from '@/components/layout/mobile-nav';
import { RequestToRentCta } from '@/components/properties/request-to-rent-cta';
import { ApiRequestError } from '@/lib/api';
import type { AuthUser } from '@/types/auth';

const user: AuthUser = {
  id: 'u1',
  role: 'TENANT',
  firstName: 'Jean',
  lastName: 'Uwimana',
  email: 'jean@example.rw',
  phone: '+250788123456',
  profileImageKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let push: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push = vi.fn();
  replace = vi.fn();
  vi.mocked(useRouter).mockReturnValue({
    push,
    replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
  );
  vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null); // default: anonymous
});
afterEach(() => vi.clearAllMocks());

const withProvider = (ui: React.ReactNode) => render(<AuthProvider>{ui}</AuthProvider>);

function Probe() {
  const { status } = useAuth();
  return <span data-testid="status">{status}</span>;
}

// ============================================================================
// Hydration
// ============================================================================
describe('auth hydration', () => {
  it('starts unauthenticated when /auth/me returns null', async () => {
    withProvider(<Probe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('becomes authenticated when /auth/me returns a user', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(user);
    withProvider(<Probe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
  });
});

// ============================================================================
// Header / mobile auth UI
// ============================================================================
describe('auth-aware navigation', () => {
  it('header shows Sign in / Create account when anonymous', async () => {
    withProvider(<AuthNav />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create account' })).toBeInTheDocument();
  });

  it('header shows Account + Sign out when authenticated', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(user);
    withProvider(<AuthNav />);
    expect(await screen.findByRole('link', { name: /Jean/ })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('mobile menu shows auth actions (authenticated)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(user);
    withProvider(<MobileNav />);
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Account' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});

// ============================================================================
// Protected routes
// ============================================================================
describe('protected routes', () => {
  it('shows a loading state while auth resolves (no private content)', () => {
    vi.mocked(authApi.fetchCurrentUser).mockReturnValue(new Promise(() => {})); // never resolves
    withProvider(
      <RequireAuth>
        <div>secret account data</div>
      </RequireAuth>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('secret account data')).toBeNull();
  });

  it('redirects to /login?returnTo=… when unauthenticated', async () => {
    withProvider(
      <RequireAuth>
        <div>secret account data</div>
      </RequireAuth>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?returnTo=%2F'));
    expect(screen.queryByText('secret account data')).toBeNull();
  });

  it('renders children when authenticated', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(user);
    withProvider(
      <RequireAuth>
        <div>secret account data</div>
      </RequireAuth>,
    );
    expect(await screen.findByText('secret account data')).toBeInTheDocument();
  });
});

// ============================================================================
// Login
// ============================================================================
describe('login form', () => {
  it('logs in and navigates to a safe returnTo', async () => {
    vi.mocked(authApi.loginRequest).mockResolvedValue(user);
    withProvider(<LoginForm returnTo="/properties/abc" />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'jean@example.rw' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(authApi.loginRequest).toHaveBeenCalledWith({
        email: 'jean@example.rw',
        password: 'secret-pass',
      }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/properties/abc'));
  });

  it('shows a safe error on invalid credentials and does not navigate', async () => {
    vi.mocked(authApi.loginRequest).mockRejectedValue(
      new ApiRequestError('Invalid email or password', 'AUTH_INVALID_CREDENTIALS', 401),
    );
    withProvider(<LoginForm returnTo="/" />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'x@y.rw' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
    expect(replace).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Register
// ============================================================================
describe('register form', () => {
  it('requires a role before submitting', async () => {
    withProvider(<RegisterForm returnTo="/" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose how you want to use/i);
    expect(authApi.registerRequest).not.toHaveBeenCalled();
  });

  it('registers with the chosen role and uses the server-returned user', async () => {
    vi.mocked(authApi.registerRequest).mockResolvedValue({ ...user, role: 'LANDLORD' });
    withProvider(<RegisterForm returnTo="/" />);
    fireEvent.click(screen.getByLabelText(/list a property/i)); // LANDLORD
    fireEvent.change(screen.getByLabelText(/^first name/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/^last name/i), { target: { value: 'K' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'ana@example.rw' } });
    fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '+250788000000' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(authApi.registerRequest).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'LANDLORD', email: 'ana@example.rw' }),
      ),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });
});

// ============================================================================
// Forgot / reset / change password
// ============================================================================
describe('password flows', () => {
  it('forgot-password shows a generic message (no existence disclosure)', async () => {
    vi.mocked(authApi.forgotPasswordRequest).mockResolvedValue({ message: 'ok' });
    withProvider(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'jean@example.rw' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset/i }));
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
    expect(screen.queryByText(/not found|no account/i)).toBeNull();
  });

  it('reset-password without a token shows an invalid-link message', () => {
    render(<ResetPasswordForm token="" />);
    expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument();
  });

  it('reset-password succeeds and points to sign in', async () => {
    vi.mocked(authApi.resetPasswordRequest).mockResolvedValue({ message: 'ok' });
    render(<ResetPasswordForm token="tok-123" />);
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpass12' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'newpass12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await waitFor(() =>
      expect(authApi.resetPasswordRequest).toHaveBeenCalledWith({
        token: 'tok-123',
        newPassword: 'newpass12',
      }),
    );
    expect(await screen.findByText(/password has been reset/i)).toBeInTheDocument();
  });

  it('change-password success clears session and redirects to login', async () => {
    vi.mocked(authApi.changePasswordRequest).mockResolvedValue({ message: 'ok' });
    withProvider(<ChangePasswordForm />);
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'oldpass12' },
    });
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpass12' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'newpass12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?reset=changed'));
  });

  it('change-password shows an error for a wrong current password', async () => {
    vi.mocked(authApi.changePasswordRequest).mockRejectedValue(
      new ApiRequestError('Current password is incorrect', 'AUTH_PASSWORD_INVALID', 401),
    );
    withProvider(<ChangePasswordForm />);
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpass12' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'newpass12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/current password is incorrect/i);
    expect(replace).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Request-to-Rent auth gate + no secret logging
// ============================================================================
describe('request-to-rent auth gate', () => {
  it('links to login with a returnTo to the request form when signed out', async () => {
    withProvider(<RequestToRentCta propertyId="abc" propertyTitle="Home" status="AVAILABLE" />);
    const link = await screen.findByRole('link', { name: 'Request to Rent' });
    expect(link).toHaveAttribute('href', '/login?returnTo=%2Fproperties%2Fabc%2Frequest');
  });

  it('links a signed-in tenant to the request form (no API call from the CTA)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(user); // TENANT
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    withProvider(<RequestToRentCta propertyId="abc" propertyTitle="Home" status="AVAILABLE" />);
    const link = await screen.findByRole('link', { name: 'Request to Rent' });
    expect(link).toHaveAttribute('href', '/properties/abc/request');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a safe role message to a signed-in landlord (no request form)', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue({ ...user, role: 'LANDLORD' });
    withProvider(<RequestToRentCta propertyId="abc" propertyTitle="Home" status="AVAILABLE" />);
    expect(await screen.findByText(/available to tenants/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Request to Rent' })).toBeNull();
  });

  it('does not log the password during login', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
      });
    }
    vi.mocked(authApi.loginRequest).mockResolvedValue(user);
    withProvider(<LoginForm returnTo="/" />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'jean@example.rw' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'super-secret-pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(authApi.loginRequest).toHaveBeenCalled());
    expect(logs.join('\n')).not.toContain('super-secret-pw');
  });
});
