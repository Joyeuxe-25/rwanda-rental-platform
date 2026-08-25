'use client';

import * as React from 'react';
import Link from 'next/link';

import { authErrorMessage } from '@/components/auth/auth-errors';
import { FormError } from '@/components/auth/auth-form-layout';
import { resetPasswordRequest } from '@/lib/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

/**
 * Reset-password form (F3). Consumes the token (passed in from the URL by the
 * server page) for the reset call only — it is never stored, logged, or exposed.
 * On success we DON'T assume the session is valid (the backend revokes sessions);
 * we prompt the user to sign in again.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const busyRef = React.useRef(false);

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Invalid reset link</AlertTitle>
        <AlertDescription>
          This link is missing its reset token. Please request a new one from{' '}
          <Link
            href="/forgot-password"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Forgot password
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await resetPasswordRequest({ token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err, 'reset'));
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Alert variant="success">
        <AlertTitle>Password updated</AlertTitle>
        <AlertDescription>
          Your password has been reset. Please{' '}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            sign in
          </Link>{' '}
          with your new password.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <FormField
        id="reset-password"
        label="New password"
        required
        helperText="At least 8 characters."
      >
        {(p) => (
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...p}
          />
        )}
      </FormField>
      <FormField id="reset-confirm" label="Confirm new password" required>
        {(p) => (
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            {...p}
          />
        )}
      </FormField>
      <Button type="submit" className="w-full" loading={submitting}>
        Reset password
      </Button>
    </form>
  );
}
