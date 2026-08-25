'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Home, KeyRound } from 'lucide-react';

import { useAuth } from '@/components/auth/auth-provider';
import { authErrorMessage } from '@/components/auth/auth-errors';
import { FormError } from '@/components/auth/auth-form-layout';
import { registerRequest } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/auth';

const ROLES: { value: UserRole; title: string; description: string; icon: typeof Home }[] = [
  {
    value: 'TENANT',
    title: "I'm looking for a home",
    description: 'Browse and request rentals.',
    icon: Home,
  },
  {
    value: 'LANDLORD',
    title: 'I want to list a property',
    description: 'Publish and manage listings.',
    icon: KeyRound,
  },
];

/**
 * Registration form (F3). Backend registration auto-creates a session; on
 * success we set auth state from the RETURNED user (role comes from the server,
 * not the client selection) and navigate to a safe returnTo.
 */
export function RegisterForm({ returnTo }: { returnTo: string }) {
  const { setUser } = useAuth();
  const router = useRouter();
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [role, setRole] = React.useState<UserRole | ''>('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const busyRef = React.useRef(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!role) {
      setError('Please choose how you want to use the platform.');
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const user = await registerRequest({ ...form, role });
      setUser(user); // role is taken from the server response
      router.replace(returnTo);
      router.refresh();
    } catch (err) {
      setError(authErrorMessage(err, 'register'));
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={error} />

      <fieldset className="space-y-2">
        <legend className="text-label mb-1">I am…</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = role === r.value;
            return (
              <label
                key={r.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                  active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={active}
                  onChange={() => setRole(r.value)}
                  className="sr-only"
                />
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-medium text-foreground">{r.title}</span>
                  <span className="block text-xs text-muted-foreground">{r.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="reg-first" label="First name" required>
          {(p) => (
            <Input
              required
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              {...p}
            />
          )}
        </FormField>
        <FormField id="reg-last" label="Last name" required>
          {(p) => (
            <Input
              required
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              {...p}
            />
          )}
        </FormField>
      </div>

      <FormField id="reg-email" label="Email" required>
        {(p) => (
          <Input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            {...p}
          />
        )}
      </FormField>

      <FormField
        id="reg-phone"
        label="Phone"
        required
        helperText="Rwandan number, e.g. +250 788 123 456."
      >
        {(p) => (
          <Input
            type="tel"
            autoComplete="tel"
            placeholder="+2507XXXXXXXX"
            required
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            {...p}
          />
        )}
      </FormField>

      <FormField id="reg-password" label="Password" required helperText="At least 8 characters.">
        {(p) => (
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            {...p}
          />
        )}
      </FormField>

      <Button type="submit" className="w-full" loading={submitting}>
        Create account
      </Button>
    </form>
  );
}
