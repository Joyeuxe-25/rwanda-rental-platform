import * as React from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  /** Stable id shared by the label, control, and description wiring. */
  id: string;
  label: string;
  required?: boolean;
  /** Helper text shown under the control when there is no error. */
  helperText?: string;
  /** Error message; when present it replaces the helper text and marks invalid. */
  error?: string;
  className?: string;
  /**
   * Render the control. Receives accessibility props to spread onto the input:
   * `id`, `aria-describedby`, `aria-invalid`, `aria-required`.
   */
  children: (fieldProps: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    'aria-required'?: boolean;
  }) => React.ReactNode;
}

/**
 * Accessible form-field pattern (F1 foundation). Establishes the required-marker
 * convention, helper/error text, and correct ARIA wiring. It does NOT implement
 * any product form — later phases compose it.
 */
export function FormField({
  id,
  label,
  required,
  helperText,
  error,
  className,
  children,
}: FormFieldProps) {
  const describedById = error ? `${id}-error` : helperText ? `${id}-helper` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </Label>

      {children({
        id,
        'aria-describedby': describedById,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${id}-helper`} className="text-sm text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
