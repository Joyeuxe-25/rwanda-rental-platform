import * as React from 'react';

import { cn } from '@/lib/utils';

const spacingMap = {
  sm: 'py-8',
  md: 'py-10 sm:py-14',
  lg: 'py-14 sm:py-20',
} as const;

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Optional heading rendered as an <h2>. */
  title?: React.ReactNode;
  /** Optional supporting copy under the title. */
  description?: React.ReactNode;
  /** Optional actions aligned to the section header (e.g. a button). */
  actions?: React.ReactNode;
  spacing?: keyof typeof spacingMap;
  /** Heading id used for `aria-labelledby` wiring. */
  headingId?: string;
}

/**
 * Composable page section. When a `title` is provided it renders an accessible
 * header (title + optional description + optional actions); otherwise it's a
 * plain spaced region. Visual treatment is intentionally minimal so callers can
 * compose freely.
 */
export function Section({
  className,
  title,
  description,
  actions,
  spacing = 'md',
  headingId,
  children,
  ...props
}: SectionProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={cn(spacingMap[spacing], className)}
      aria-labelledby={title && headingId ? headingId : undefined}
      {...props}
    >
      {hasHeader && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            {title && (
              <h2 id={headingId} className="font-display text-2xl font-semibold tracking-tight">
                {title}
              </h2>
            )}
            {description && <p className="max-w-2xl text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
