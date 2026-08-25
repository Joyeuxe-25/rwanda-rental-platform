import * as React from 'react';
import { Check, Play, Flag, Ban, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { RentalStatus } from '@/types/rental';

/**
 * Rental lifecycle timeline (F5). Renders ONLY the real backend milestones:
 * request accepted → rental activated → ACTIVE → (Completed | Terminated). It
 * never implies a payment step. Meaning is carried by text + icon, not color.
 */
interface Step {
  key: string;
  label: string;
  Icon: LucideIcon;
  state: 'done' | 'current' | 'upcoming';
  tone?: string;
}

export function RentalTimeline({ status }: { status: RentalStatus }) {
  const steps: Step[] = [
    { key: 'accepted', label: 'Request accepted', Icon: Check, state: 'done' },
    {
      key: 'active',
      label: 'Rental activated',
      Icon: Play,
      state: status === 'ACTIVE' ? 'current' : 'done',
    },
  ];

  if (status === 'COMPLETED') {
    steps.push({
      key: 'end',
      label: 'Completed',
      Icon: Flag,
      state: 'current',
      tone: 'text-success',
    });
  } else if (status === 'TERMINATED') {
    steps.push({
      key: 'end',
      label: 'Terminated',
      Icon: Ban,
      state: 'current',
      tone: 'text-destructive',
    });
  } else {
    steps.push({ key: 'end', label: 'Completed or terminated', Icon: Flag, state: 'upcoming' });
  }

  return (
    <ol className="space-y-0" aria-label="Rental timeline">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const active = step.state !== 'upcoming';
        const tone = step.tone ?? 'text-primary';
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full ring-1',
                  active
                    ? cn('bg-card ring-current', tone)
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
