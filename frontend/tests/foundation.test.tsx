import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Logo } from '@/components/branding/logo';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { API_BASE_URL, DEFAULT_API_BASE_URL, getApiBaseUrl } from '@/lib/env';
import { cn } from '@/lib/utils';

/**
 * F0 foundation tests. These prove the app's building blocks render and that
 * the API base configuration can be read safely. No product-feature tests.
 */

describe('foundation', () => {
  it('renders a foundational UI primitive (Button)', () => {
    render(<Button>Get started</Button>);
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
  });

  it('renders the brand logo with an accessible label', () => {
    render(<Logo />);
    expect(screen.getByLabelText('Rwanda Rental Platform logo')).toBeInTheDocument();
    expect(screen.getByText('Rwanda Rental')).toBeInTheDocument();
  });

  it('renders the footer branding linking to NEROXIAFRICA in a new, safe tab', () => {
    render(<SiteFooter />);
    const link = screen.getByRole('link', { name: 'NEROXIAFRICA' });
    expect(link).toHaveAttribute('href', 'https://neroxiafrica.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
  });

  it('reads the API base configuration safely (defaults to local, versioned)', () => {
    expect(getApiBaseUrl()).toBe(API_BASE_URL);
    expect(DEFAULT_API_BASE_URL).toBe('http://localhost:4000/api/v1');
    expect(API_BASE_URL).toMatch(/\/api\/v1$/);
    // No trailing slash is carried into the base URL.
    expect(API_BASE_URL.endsWith('/')).toBe(false);
  });

  it('normalizes API errors without leaking request data', () => {
    const err = new ApiRequestError('Invalid email or password', 'AUTH_INVALID_CREDENTIALS', 401);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(err.status).toBe(401);
  });

  it('merges class names with the cn() utility', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4'); // tailwind-merge de-dupes conflicts
    expect(cn('text-sm', false && 'hidden', 'font-medium')).toBe('text-sm font-medium');
  });
});
