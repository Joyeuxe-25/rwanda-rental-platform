import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Header/mobile-nav consume auth state; stub it as unauthenticated here (auth
// flows are covered in tests/auth.test.tsx).
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    setUser: vi.fn(),
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import { MobileNav } from '@/components/layout/mobile-nav';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { SkipLink } from '@/components/layout/skip-link';
import { Breadcrumb } from '@/components/ui/breadcrumb';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('application shell', () => {
  it('renders the header with the brand and desktop navigation links', () => {
    render(<SiteHeader />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    const primary = screen.getByRole('navigation', { name: 'Primary' });
    for (const label of ['Home', 'Properties', 'About', 'Contact']) {
      expect(within(primary).getByRole('link', { name: label })).toBeInTheDocument();
    }
    // Anonymous auth controls (no backend action).
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create account' })).toBeInTheDocument();
  });

  it('opens and closes the mobile menu (click to open, Escape to close)', async () => {
    render(<MobileNav />);
    const trigger = screen.getByRole('button', { name: /open menu/i });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Mobile nav links are present inside the sheet.
    expect(within(dialog).getByRole('link', { name: 'Properties' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('mobile menu trigger has an accessible name (keyboard/SR operable)', () => {
    render(<MobileNav />);
    const trigger = screen.getByRole('button', { name: /open menu/i });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-label', 'Open menu');
  });

  it('renders the footer with the NEROXIAFRICA credit (new tab, safe rel)', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'NEROXIAFRICA' });
    expect(link).toHaveAttribute('href', 'https://neroxiafrica.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
  });

  it('skip link targets the main content landmark', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: /skip to content/i });
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('breadcrumb exposes correct semantics (aria-label + current page)', () => {
    render(<Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Design system' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeInTheDocument();
    const current = within(nav).getByText('Design system');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('layout primitives render their content', () => {
    render(
      <PageContainer>
        <Section title="My section" headingId="s1" description="desc">
          <p>content</p>
        </Section>
      </PageContainer>,
    );
    expect(screen.getByRole('heading', { name: 'My section', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('renders the shell without making any backend network request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    render(
      <>
        <SiteHeader />
        <SiteFooter />
      </>,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
