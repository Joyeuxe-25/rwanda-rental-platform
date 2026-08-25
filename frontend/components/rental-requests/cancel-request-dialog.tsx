'use client';

import * as React from 'react';

import { rentalRequestErrorMessage } from '@/components/rental-requests/rental-request-errors';
import { Button } from '@/components/ui/button';
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
import { cancelMyRentalRequest } from '@/lib/rental-requests';
import type { TenantRentalRequest } from '@/types/rental-request';

/**
 * Confirmation dialog for cancelling a PENDING request (F4). Guarded against
 * double-submit with a ref. On success the parent receives the backend's updated
 * request (no optimistic terminal mutation). A conflict (already processed) is
 * surfaced safely and the parent re-fetches the authoritative state.
 */
export function CancelRequestDialog({
  requestId,
  onCancelled,
  onConflict,
}: {
  requestId: string;
  onCancelled: (updated: TenantRentalRequest) => void;
  onConflict: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);

  async function onConfirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await cancelMyRentalRequest(requestId);
      setOpen(false);
      onCancelled(updated);
    } catch (err) {
      setError(rentalRequestErrorMessage(err, 'cancel'));
      // Whether it's a state conflict or transient, re-sync from the backend.
      onConflict();
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Cancel request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this rental request?</DialogTitle>
          <DialogDescription>
            This will withdraw your request for this property. This can’t be undone, but you can
            send a new request later while the property is available.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={submitting}>
              Keep request
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} loading={submitting}>
            Cancel request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
