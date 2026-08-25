'use client';

import * as React from 'react';

import { fetchCurrentUser, logoutRequest } from '@/lib/auth';
import type { AuthStatus, AuthUser } from '@/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** Re-fetch `/auth/me` and update state. */
  refresh: () => Promise<void>;
  /** Set the user directly (e.g. from a login/register response). */
  setUser: (user: AuthUser | null) => void;
  /** Log out server-side, then clear local state. Always clears locally. */
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * Central authentication state (F3). The backend is the source of truth: on
 * mount we call `GET /auth/me` (cookie-credentialed) to hydrate — 200 →
 * authenticated, 401 → unauthenticated. State is never derived from
 * localStorage, JS-readable cookies, or the URL.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = React.useState<AuthUser | null>(null);
  const [status, setStatus] = React.useState<AuthStatus>('loading');

  const refresh = React.useCallback(async () => {
    try {
      const u = await fetchCurrentUser();
      setUserState(u);
      setStatus(u ? 'authenticated' : 'unauthenticated');
    } catch {
      // Network/other failure — treat as unauthenticated (public-first app).
      // We do NOT loop or auto-retry here.
      setUserState(null);
      setStatus('unauthenticated');
    }
  }, []);

  const setUser = React.useCallback((u: AuthUser | null) => {
    setUserState(u);
    setStatus(u ? 'authenticated' : 'unauthenticated');
  }, []);

  const signOut = React.useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Ignore — we clear local state regardless; the backend owns the cookie.
    }
    setUserState(null);
    setStatus('unauthenticated');
  }, []);

  // Hydrate once on mount.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, status, refresh, setUser, signOut }),
    [user, status, refresh, setUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context. Must be used within `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
