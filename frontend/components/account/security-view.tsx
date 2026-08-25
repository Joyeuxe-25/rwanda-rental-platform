'use client';

import * as React from 'react';
import Link from 'next/link';

import { AccountShell } from '@/components/account/account-shell';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

/**
 * Security page (F8). Change password (B2). The backend revokes all sessions on a
 * password change, so the form clears auth state and sends the user to sign in
 * again — this page does not introduce any other password mechanism.
 */
export function SecurityView() {
  return (
    <AccountShell title="Security" description="Manage your password.">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            For your security, you’ll be signed out and asked to sign in again after changing your
            password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChangePasswordForm />
          <Separator />
          <p className="text-sm text-muted-foreground">
            Forgot your current password?{' '}
            <Link
              href="/forgot-password"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Reset it instead
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </AccountShell>
  );
}
