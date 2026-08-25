'use client';

import * as React from 'react';
import { Flag } from 'lucide-react';

import { rentalErrorMessage } from '@/components/rentals/rental-errors';
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
import { completeRental, terminateRental } from '@/lib/rentals';
import type { LandlordRental } from '@/types/rental';

/**
 * Complete / Terminate controls for an ACTIVE rental (F5), landlord-only. Both
 * are atomic on the backend — the frontend never assumes success from the click,
 * and both require a confirmation dialog. A conflict (no longer active) is shown
 * safely and the parent re-syncs authoritative state.
 *
 * Neither action creates or references any payment — F5 has no payments.
 */
export function RentalLifecycleControls({
  rentalId,
  onUpdated,
  onConflict,
}: {
  rentalId: string;
  onUpdated: (updated: LandlordRental, action: 'complete' | 'terminate') => void;
  onConflict: () => void;
}) {
  const [openAction, setOpenAction] = React.useState<null | 'complete' | 'terminate'>(null);
  const [pending, setPending] = React.useState<null | 'complete' | 'terminate'>(null);
  const [error, setError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);

  async function run(action: 'complete' | 'terminate') {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(action);
    setError(null);
    try {
      const updated =
        action === 'complete' ? await completeRental(rentalId) : await terminateRental(rentalId);
      setOpenAction(null);
      onUpdated(updated, action);
    } catch (err) {
      setError(rentalErrorMessage(err, action));
      setOpenAction(null);
      onConflict();
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {/* Complete — the normal end of a rental. */}
        <Dialog
          open={openAction === 'complete'}
          onOpenChange={(o) => setOpenAction(o ? 'complete' : null)}
        >
          <DialogTrigger asChild>
            <Button disabled={pending !== null}>
              <Flag className="size-4" aria-hidden="true" />
              Complete rental
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Complete this rental?</DialogTitle>
              <DialogDescription>
                This ends the rental normally and marks it inactive; the property becomes available
                again. This can’t be undone. No payment is involved.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={pending === 'complete'}>
                  Keep active
                </Button>
              </DialogClose>
              <Button onClick={() => void run('complete')} loading={pending === 'complete'}>
                Complete rental
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Terminate — ending the rental through the termination lifecycle. */}
        <Dialog
          open={openAction === 'terminate'}
          onOpenChange={(o) => setOpenAction(o ? 'terminate' : null)}
        >
          <DialogTrigger asChild>
            <Button variant="outline" disabled={pending !== null}>
              Terminate rental
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Terminate this rental?</DialogTitle>
              <DialogDescription>
                This ends the rental early and marks it inactive; the property becomes available
                again. This can’t be undone. No payment is involved.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={pending === 'terminate'}>
                  Keep active
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => void run('terminate')}
                loading={pending === 'terminate'}
              >
                Terminate rental
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted-foreground">
        Completing or terminating frees the property. It does not involve any payment.
      </p>
    </div>
  );
}
