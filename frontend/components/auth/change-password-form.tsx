'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/auth-provider';
import { authErrorMessage } from '@/components/auth/auth-errors';
import { FormError } from '@/components/auth/auth-form-layout';
import { changePasswordRequest } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

/**
 * Change-password form (F3). The backend revokes existing sessions on a password
 * change, so we do NOT assume the session stays valid — on success we clear auth
 * state and send the user to sign in again.
 */
export function ChangePasswordForm() {
  const { setUser } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const busyRef = React.useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await changePasswordRequest({ currentPassword: current, newPassword: next });
      setUser(null); // sessions were revoked — require a fresh sign-in
      router.replace('/login?reset=changed');
      router.refresh();
    } catch (err) {
      setError(authErrorMessage(err, 'change'));
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <FormField id="cp-current" label="Current password" required>
        {(p) => (
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            {...p}
          />
        )}
      </FormField>
      <FormField id="cp-new" label="New password" required helperText="At least 8 characters.">
        {(p) => (
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            {...p}
          />
        )}
      </FormField>
      <FormField id="cp-confirm" label="Confirm new password" required>
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
      <Button type="submit" loading={submitting}>
        Change password
      </Button>
    </form>
  );
}
