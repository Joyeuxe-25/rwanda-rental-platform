import * as React from 'react';
import { Check, Clock, X, Ban, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { RentalRequestStatus } from '@/types/rental-request';

/**
 * A simple, accessible request lifecycle timeline (F4). It renders ONLY the real
 * backend states — Submitted → Pending → (Accepted | Rejected | Cancelled) — and
 * never invents intermediate steps. Meaning is carried by text + icon, not color.
 */
interface Step {
  key: string;
  label: string;
  Icon: LucideIcon;
  state: 'done' | 'current' | 'upcoming';
}

const TERMINAL: Record<
  Exclude<RentalRequestStatus, 'PENDING'>,
  { label: string; Icon: LucideIcon; tone: string }
> = {
  ACCEPTED: { label: 'Accepted', Icon: Check, tone: 'text-success' },
  REJECTED: { label: 'Rejected', Icon: X, tone: 'text-destructive' },
  CANCELLED: { label: 'Cancelled', Icon: Ban, tone: 'text-muted-foreground' },
};

export function RequestTimeline({ status }: { status: RentalRequestStatus }) {
  const steps: Step[] = [
    { key: 'submitted', label: 'Submitted', Icon: Check, state: 'done' },
    {
      key: 'pending',
      label: 'Pending review',
      Icon: Clock,
      state: status === 'PENDING' ? 'current' : 'done',
    },
  ];

  if (status !== 'PENDING') {
    const t = TERMINAL[status];
    steps.push({ key: 'final', label: t.label, Icon: t.Icon, state: 'current' });
  } else {
    steps.push({ key: 'final', label: 'Decision', Icon: Clock, state: 'upcoming' });
  }

  return (
    <ol className="space-y-0" aria-label="Request timeline">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const terminalTone =
          isLast && status !== 'PENDING' ? TERMINAL[status].tone : 'text-primary';
        const active = step.state !== 'upcoming';
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full ring-1',
                  active
                    ? cn('bg-card ring-current', terminalTone)
                    : 'bg-muted text-muted-foreground ring-border',
                )}
              >
                <step.Icon className="size-4" aria-hidden="true" />
              </span>
              {!isLast && (
                <span
                  className={cn('my-1 w-px flex-1', active ? 'bg-primary/40' : 'bg-border')}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className={cn('pb-6 pt-1', isLast && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </p>
              {step.state === 'current' && (
                <p className="text-xs text-muted-foreground">Current status</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
