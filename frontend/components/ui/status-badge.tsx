import * as React from 'react';
import {
  CheckCircle2,
  Clock,
  Circle,
  XCircle,
  AlertTriangle,
  Info,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Semantic status presentation for future product states. State meaning is
 * ALWAYS conveyed by an icon + text label — never by color alone (accessibility).
 * F1 only establishes the presentation; it is not connected to backend state.
 */
export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'pending';

const toneStyles: Record<StatusTone, { className: string; Icon: LucideIcon }> = {
  success: { className: 'bg-success/12 text-success ring-success/25', Icon: CheckCircle2 },
  warning: { className: 'bg-warning/15 text-warning ring-warning/30', Icon: AlertTriangle },
  error: { className: 'bg-destructive/12 text-destructive ring-destructive/25', Icon: XCircle },
  info: { className: 'bg-primary/10 text-primary ring-primary/20', Icon: Info },
  neutral: { className: 'bg-muted text-muted-foreground ring-border', Icon: Circle },
  pending: { className: 'bg-secondary/15 text-foreground ring-secondary/30', Icon: Clock },
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  /** Visible label (e.g. AVAILABLE, PENDING). Required for non-color meaning. */
  label: string;
  /** Hide the icon (label still carries meaning). */
  hideIcon?: boolean;
}

export function StatusBadge({
  tone = 'neutral',
  label,
  hideIcon = false,
  className,
  ...props
}: StatusBadgeProps) {
  const { className: toneClass, Icon } = toneStyles[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        toneClass,
        className,
      )}
      {...props}
    >
      {!hideIcon && <Icon className="size-3.5" aria-hidden="true" />}
      {label}
    </span>
  );
}
