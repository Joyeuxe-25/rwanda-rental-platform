'use client';

import * as React from 'react';
import { Check } from 'lucide-react';

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
import { approveRentalRequest, rejectRentalRequest } from '@/lib/rental-requests';
import type { LandlordRentalRequest } from '@/types/rental-request';

/**
 * Approve / Reject controls for a PENDING request (F4). Both are atomic on the
 * backend — the frontend never assumes success from the click. Approve is a
 * direct action; reject requires a confirmation dialog. A conflict (already
 * processed) is shown safely and the parent re-syncs authoritative state.
 *
 * IMPORTANT: acceptance sets the request to ACCEPTED only. It does NOT create a
 * rental or a payment — that is a later phase.
 */
export function LandlordDecisionControls({
  requestId,
  onUpdated,
  onConflict,
}: {
  requestId: string;
  onUpdated: (updated: LandlordRentalRequest, action: 'approve' | 'reject') => void;
  onConflict: () => void;
}) {
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [pending, setPending] = React.useState<null | 'approve' | 'reject'>(null);
  const [error, setError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);

  async function run(action: 'approve' | 'reject') {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(action);
    setError(null);
    try {
      const updated =
        action === 'approve'
          ? await approveRentalRequest(requestId)
          : await rejectRentalRequest(requestId);
      setRejectOpen(false);
      onUpdated(updated, action);
    } catch (err) {
      setError(rentalRequestErrorMessage(err, action));
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
        <Button onClick={() => void run('approve')} loading={pending === 'approve'}>
          <Check className="size-4" aria-hidden="true" />
          Approve request
        </Button>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={pending !== null}>
              Reject request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject this rental request?</DialogTitle>
              <DialogDescription>
                The tenant will see that their request was declined. This can’t be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={pending === 'reject'}>
                  Keep pending
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => void run('reject')}
                loading={pending === 'reject'}
              >
                Reject request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted-foreground">
        Approving marks the request as accepted. It does not create a rental or take any payment
        yet.
      </p>
    </div>
  );
}
