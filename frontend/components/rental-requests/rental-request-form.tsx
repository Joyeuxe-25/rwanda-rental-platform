'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { RentalRequestStatusBadge } from '@/components/rental-requests/rental-request-status-badge';
import { rentalRequestErrorMessage } from '@/components/rental-requests/rental-request-errors';
import { FormError } from '@/components/auth/auth-form-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError } from '@/lib/api';
import { createRentalRequest } from '@/lib/rental-requests';
import { formatDate } from '@/lib/format';
import type { TenantRentalRequest } from '@/types/rental-request';

const MAX_MESSAGE = 1000;

/**
 * The rental-request form (F4). Submits `POST /rental-requests` with ONLY
 * `{ propertyId, message? }` — the tenant identity is derived by the backend, and
 * no server-controlled field is ever sent. Double-submission is prevented with a
 * ref guard (not just the disabled attribute). On success it shows a PENDING
 * confirmation; it never claims the rental is confirmed.
 */
export function RentalRequestForm({
  propertyId,
  propertyTitle,
}: {
  propertyId: string;
  propertyTitle: string;
}) {
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [duplicate, setDuplicate] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [created, setCreated] = React.useState<TenantRentalRequest | null>(null);
  const busyRef = React.useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    setDuplicate(false);
    try {
      const request = await createRentalRequest({
        propertyId,
        message: message.trim() ? message.trim() : undefined,
      });
      setCreated(request);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'RENTAL_REQUEST_ALREADY_EXISTS') {
        setDuplicate(true);
      }
      setError(rentalRequestErrorMessage(err, 'create'));
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <span className="bg-success/12 mb-2 flex size-12 items-center justify-center rounded-full text-success">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </span>
          <CardTitle className="text-h3">Rental request sent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <p className="text-body text-muted-foreground">
            Your request is now waiting for the landlord&rsquo;s response. The landlord will review
            your request before the rental becomes active.
          </p>
          <dl className="mx-auto max-w-sm space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-left text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Property</dt>
              <dd className="font-medium text-foreground">{propertyTitle}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <RentalRequestStatusBadge status={created.status} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="font-medium text-foreground">{formatDate(created.createdAt)}</dd>
            </div>
          </dl>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/requests">View my requests</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/requests/${created.id}`}>View this request</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Request to Rent</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={error} />
          {duplicate && (
            <p className="text-sm">
              <Link
                href="/requests"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                View your existing request
              </Link>
            </p>
          )}

          <FormField
            id="request-message"
            label="Message to the landlord"
            helperText="Optional — briefly introduce yourself or ask a question."
          >
            {(p) => (
              <Textarea
                rows={5}
                maxLength={MAX_MESSAGE}
                placeholder="Hi, I'm interested in renting this property…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                {...p}
              />
            )}
          </FormField>
          <p className="text-right text-xs text-muted-foreground" aria-live="polite">
            {message.length}/{MAX_MESSAGE}
          </p>

          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            The landlord will review your request before the rental becomes active. Submitting does
            not create a rental or any payment.
          </p>

          <Button type="submit" className="w-full" loading={submitting}>
            Send request
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
