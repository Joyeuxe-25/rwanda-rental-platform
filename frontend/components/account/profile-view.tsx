'use client';

import * as React from 'react';

import { useAuth } from '@/components/auth/auth-provider';
import { AccountShell } from '@/components/account/account-shell';
import { ProfileForm } from '@/components/account/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Profile edit page (F8). Pre-fills from the AuthProvider's hydrated user (the
 * same SafeUser as `GET /users/me`), so no duplicate fetch is needed; saving goes
 * through `PATCH /users/me` and updates the provider.
 */
export function ProfileView() {
  return (
    <AccountShell title="Edit profile" description="Update your name and phone number.">
      <ProfileContent />
    </AccountShell>
  );
}

function ProfileContent() {
  const { user } = useAuth();
  if (!user) return null; // RequireAuth guarantees authenticated; defensive.

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile details</CardTitle>
      </CardHeader>
      <CardContent>
        <ProfileForm user={user} />
      </CardContent>
    </Card>
  );
}
