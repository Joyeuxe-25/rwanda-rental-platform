/**
 * Public navigation configuration (F1). These are foundation/placeholder routes
 * for the global shell — they perform NO backend actions. Routes that don't
 * exist yet still render as links; product pages arrive in later phases.
 */
export interface NavItem {
  label: string;
  href: string;
}

export const primaryNav: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Properties', href: '/properties' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

/** Footer link columns (foundation placeholders — no legal pages exist yet). */
export const footerNav: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Platform',
    items: [
      { label: 'Home', href: '/' },
      { label: 'Browse properties', href: '/properties' },
      { label: 'How it works', href: '/about' },
    ],
  },
  {
    heading: 'Support',
    items: [
      { label: 'Contact', href: '/contact' },
      { label: 'Help centre', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    items: [
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Terms', href: '/legal/terms' },
    ],
  },
];
