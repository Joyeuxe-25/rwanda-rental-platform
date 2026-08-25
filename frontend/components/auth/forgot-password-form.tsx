'use client';

import * as React from 'react';

import { FormError } from '@/components/auth/auth-form-layout';
import { forgotPasswordRequest } from '@/lib/auth';
import { ApiRequestError } from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

const GENERIC_SUCCESS =
  "If an account exists for that email, you'll receive instructions to reset your password.";

/**
 * Forgot-password form (F3). PRIVACY: always shows the same generic message and
 * never reveals whether the email exists. A dev-only reset token that the backend
 * may return is intentionally ignored (never read, logged, or displayed).
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const busyRef = React.useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await forgotPasswordRequest({ email }); // response (incl. any dev token) ignored
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 429
          ? 'Too many attempts. Please wait a moment and try again.'
          : 'Something went wrong. Please try again.',
      );
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Alert variant="success">
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>{GENERIC_SUCCESS}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <FormField id="forgot-email" label="Email">
        {(p) => (
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            {...p}
          />
        )}
      </FormField>
      <Button type="submit" className="w-full" loading={submitting}>
        Send reset instructions
      </Button>
    </form>
  );
}
