'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { RentalStatusBadge } from '@/components/rentals/rental-status-badge';
import { rentalErrorMessage } from '@/components/rentals/rental-errors';
import { FormError } from '@/components/auth/auth-form-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { createRentalFromRequest } from '@/lib/rentals';
import { formatDate, formatMoney } from '@/lib/format';
import type { PublicProperty } from '@/types/property';
import type { TenantRental } from '@/types/rental';

/**
 * Rental conversion form (F5). Converts an ACCEPTED request into an ACTIVE rental
 * via `POST /rentals/from-request/:id`, sending at most `{ startDate?, endDate? }`
 * — never money, status, or identity (all server-derived). A ref guard prevents
 * double-submission. On success it shows "Rental activated" (ACTIVE) with a link
 * to the rental — it never mentions or implies any payment.
 */
export function RentalConversionForm({
  rentalRequestId,
  property,
}: {
  rentalRequestId: string;
  property: PublicProperty;
}) {
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [created, setCreated] = React.useState<TenantRental | null>(null);
  const busyRef = React.useRef(false);

  function validDates(): boolean {
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      setDateError('The start date must be before the end date.');
      return false;
    }
    setDateError(null);
    return true;
  }

  async function onConfirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const rental = await createRentalFromRequest(rentalRequestId, {
        ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
        ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}),
      });
      setOpen(false);
      setCreated(rental);
    } catch (err) {
      setError(rentalErrorMessage(err, 'convert'));
      setOpen(false);
    } finally {
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
          <CardTitle className="text-h3">Rental activated</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <p className="text-body text-muted-foreground">
            Your rental for &ldquo;{property.title}&rdquo; is now active. You can view its details
            and status any time from your rentals.
          </p>
          <dl className="mx-auto max-w-sm space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-left text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Property</dt>
              <dd className="font-medium text-foreground">{property.title}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <RentalStatusBadge status={created.status} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Start date</dt>
              <dd className="font-medium text-foreground">{formatDate(created.startDate)}</dd>
            </div>
          </dl>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild>
              <Link href={`/rentals/${created.id}`}>View rental</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/rentals">All my rentals</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Start your rental</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <FormError message={error} />

          <dl className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Monthly rent</dt>
              <dd className="font-medium text-foreground">
                {formatMoney(property.monthlyRent, property.currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Security deposit</dt>
              <dd className="font-medium text-foreground">
                {formatMoney(property.securityDeposit, property.currency)}
              </dd>
            </div>
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="rental-start"
              label="Start date"
              helperText="Leave blank to start today."
            >
              {(p) => (
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  {...p}
                />
              )}
            </FormField>
            <FormField
              id="rental-end"
              label="End date"
              helperText="Optional — leave blank for open-ended."
            >
              {(p) => (
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  {...p}
                />
              )}
            </FormField>
          </div>
          {dateError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {dateError}
            </p>
          )}

          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Starting the rental marks the property as occupied and creates an active rental record.
            No payment is taken at this step.
          </p>

          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (next && !validDates()) return;
              setOpen(next);
            }}
          >
            <DialogTrigger asChild>
              <Button className="w-full">Start rental</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start this rental?</DialogTitle>
                <DialogDescription>
                  You&rsquo;re about to start a rental for &ldquo;{property.title}&rdquo; at{' '}
                  {formatMoney(property.monthlyRent, property.currency)} / month
                  {startDate ? `, beginning ${formatDate(new Date(startDate).toISOString())}` : ''}.
                  The property becomes occupied. No payment is taken now.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" disabled={submitting}>
                    Not yet
                  </Button>
                </DialogClose>
                <Button onClick={onConfirm} loading={submitting}>
                  Start rental
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
