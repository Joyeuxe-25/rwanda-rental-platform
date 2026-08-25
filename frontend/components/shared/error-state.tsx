import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface ErrorStateProps {
  title?: string;
  /** A SAFE, user-facing message. Never pass raw backend/internal error text. */
  description?: string;
  /** Primary recovery action (e.g. retry). */
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional secondary action rendered beside the primary (e.g. a link back). */
  secondaryAction?: React.ReactNode;
  className?: string;
}

/** Design-system error surface. Shows only safe, user-facing copy. */
export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  onRetry,
  retryLabel = 'Try again',
  secondaryAction,
  className,
}: ErrorStateProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {(onRetry || secondaryAction) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
            {secondaryAction}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
