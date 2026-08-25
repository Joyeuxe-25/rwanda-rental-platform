'use client';

import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';

import { useAuth } from '@/components/auth/auth-provider';
import { ROLE_LABEL } from '@/components/account/account-links';
import { profileErrorMessage } from '@/components/account/account-errors';
import { FormError } from '@/components/auth/auth-form-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { updateMyProfile } from '@/lib/profile';
import type { ProfileUpdateInput } from '@/types/profile';
import type { AuthUser } from '@/types/auth';

/**
 * Profile edit form (F8). Editable fields: firstName, lastName, phone. Email and
 * role are shown read-only (immutable in B3). On submit it sends ONLY the changed
 * fields via `PATCH /users/me` — never role/email/id, never a no-op request — and
 * on success updates the AuthProvider user (so the header/avatar reflect it).
 */
export function ProfileForm({ user }: { user: AuthUser }) {
  const { setUser } = useAuth();
  const [firstName, setFirstName] = React.useState(user.firstName);
  const [lastName, setLastName] = React.useState(user.lastName);
  const [phone, setPhone] = React.useState(user.phone);
  const [fieldErrors, setFieldErrors] = React.useState<ProfileUpdateInput>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const busyRef = React.useRef(false);

  // The current baseline (updates after a successful save so "dirty" resets).
  const [base, setBase] = React.useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  });

  const diff = React.useMemo<ProfileUpdateInput>(() => {
    const d: ProfileUpdateInput = {};
    if (firstName.trim() !== base.firstName) d.firstName = firstName.trim();
    if (lastName.trim() !== base.lastName) d.lastName = lastName.trim();
    if (phone.trim() !== base.phone) d.phone = phone.trim();
    return d;
  }, [firstName, lastName, phone, base]);

  const dirty = Object.keys(diff).length > 0;

  function validate(): boolean {
    const errs: ProfileUpdateInput = {};
    if (diff.firstName !== undefined && diff.firstName.length < 1)
      errs.firstName = 'First name is required.';
    if (diff.lastName !== undefined && diff.lastName.length < 1)
      errs.lastName = 'Last name is required.';
    if (diff.phone !== undefined && diff.phone.length < 7)
      errs.phone = 'Enter a valid phone number.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    setSaved(false);
    if (!dirty) return; // no-op: never issue an empty PATCH
    if (!validate()) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateMyProfile(diff); // only changed fields
      setUser(updated); // header + avatar update immediately
      setBase({
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
      });
      setFirstName(updated.firstName);
      setLastName(updated.lastName);
      setPhone(updated.phone);
      setFieldErrors({});
      setSaved(true);
    } catch (err) {
      setError(profileErrorMessage(err));
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {saved && (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Profile updated</AlertTitle>
          <AlertDescription>Your changes have been saved.</AlertDescription>
        </Alert>
      )}
      <FormError message={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="pf-first" label="First name" required error={fieldErrors.firstName}>
          {(p) => (
            <Input
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setSaved(false);
              }}
              {...p}
            />
          )}
        </FormField>
        <FormField id="pf-last" label="Last name" required error={fieldErrors.lastName}>
          {(p) => (
            <Input
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setSaved(false);
              }}
              {...p}
            />
          )}
        </FormField>
      </div>

      <FormField
        id="pf-phone"
        label="Phone"
        required
        error={fieldErrors.phone}
        helperText="Rwandan number, e.g. +250 788 123 456."
      >
        {(p) => (
          <Input
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSaved(false);
            }}
            {...p}
          />
        )}
      </FormField>

      {/* Read-only, immutable fields. */}
      <FormField
        id="pf-email"
        label="Email"
        helperText="Email changes require verification and aren’t available yet."
      >
        {(p) => <Input type="email" value={user.email} readOnly disabled {...p} />}
      </FormField>

      <div className="space-y-1.5">
        <span className="text-label">Role</span>
        <div>
          <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Your role can’t be changed.</p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting} disabled={!dirty}>
          Save changes
        </Button>
        {!dirty && !saved && (
          <span className="text-sm text-muted-foreground">No changes to save</span>
        )}
      </div>
    </form>
  );
}
