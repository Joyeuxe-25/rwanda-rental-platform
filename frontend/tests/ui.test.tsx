import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DesignSystemPage from '@/app/design-system/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';

describe('UI primitives', () => {
  it('renders each Button variant', () => {
    const variants = [
      'default',
      'secondary',
      'accent',
      'outline',
      'ghost',
      'destructive',
      'link',
    ] as const;
    render(
      <>
        {variants.map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
      </>,
    );
    for (const v of variants) {
      expect(screen.getByRole('button', { name: v })).toBeInTheDocument();
    }
  });

  it('a loading Button is disabled and marked busy without losing its label', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('renders Badge variants', () => {
    const variants = [
      'default',
      'secondary',
      'accent',
      'info',
      'neutral',
      'success',
      'warning',
      'destructive',
      'outline',
    ] as const;
    render(
      <>
        {variants.map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </>,
    );
    for (const v of variants) expect(screen.getByText(v)).toBeInTheDocument();
  });

  it('StatusBadge conveys meaning with a text label (not color alone)', () => {
    render(
      <>
        <StatusBadge tone="success" label="AVAILABLE" />
        <StatusBadge tone="pending" label="PENDING" />
        <StatusBadge tone="error" label="REJECTED" />
      </>,
    );
    expect(screen.getByText('AVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText('REJECTED')).toBeInTheDocument();
  });

  it('FormField wires label, required marker, and error message accessibly', () => {
    render(
      <FormField id="email" label="Email" required error="Invalid email">
        {(p) => <Input {...p} />}
      </FormField>,
    );
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'email-error');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Invalid email');
    expect(error).toHaveAttribute('id', 'email-error');
  });
});

describe('design-system showcase', () => {
  it('renders without backend network requests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    render(<DesignSystemPage />);
    expect(screen.getByRole('heading', { name: 'Design system', level: 1 })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
