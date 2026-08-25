'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/auth-provider';
import { authErrorMessage } from '@/components/auth/auth-errors';
import { FormError } from '@/components/auth/auth-form-layout';
import { loginRequest } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

/** Login form (F3). On success sets auth state and navigates to a safe returnTo. */
export function LoginForm({ returnTo }: { returnTo: string }) {
  const { setUser } = useAuth();
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const busyRef = React.useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return; // guard double-submit beyond disabled state
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const user = await loginRequest({ email, password });
      setUser(user);
      router.replace(returnTo);
      router.refresh();
    } catch (err) {
      setError(authErrorMessage(err, 'login'));
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />
      <FormField id="login-email" label="Email">
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
      <FormField id="login-password" label="Password">
        {(p) => (
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...p}
          />
        )}
      </FormField>
      <div className="text-right">
        <a
          href="/forgot-password"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Forgot password?
        </a>
      </div>
      <Button type="submit" className="w-full" loading={submitting}>
        Sign in
      </Button>
    </form>
  );
}
