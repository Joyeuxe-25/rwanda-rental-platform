import type { UserRole } from '@/types/auth';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Role-aware feature links shared across the account nav, the header, the mobile
 * menu, and the account overview (F8 consolidation). A tenant NEVER sees a
 * landlord path or vice versa — the hrefs are chosen by the current user's role.
 */
export function roleFeatureLinks(role: UserRole): NavItem[] {
  const isLandlord = role === 'LANDLORD';
  return [
    // Landlord-only: property management & publishing (F11). Never shown to tenants.
    ...(isLandlord ? [{ href: '/landlord/properties', label: 'My properties' }] : []),
    isLandlord
      ? { href: '/landlord/requests', label: 'Rental requests' }
      : { href: '/requests', label: 'My requests' },
    isLandlord
      ? { href: '/landlord/rentals', label: 'Rentals' }
      : { href: '/rentals', label: 'My rentals' },
    { href: isLandlord ? '/landlord/payments' : '/payments', label: 'Payments' },
    { href: '/notifications', label: 'Notifications' },
  ];
}

/** Account section links (same for both roles). */
export const ACCOUNT_SECTION_LINKS: NavItem[] = [
  { href: '/account', label: 'Overview' },
  { href: '/account/profile', label: 'Edit profile' },
  { href: '/account/security', label: 'Security' },
];

/** Human-readable role label. */
export const ROLE_LABEL: Record<UserRole, string> = { TENANT: 'Tenant', LANDLORD: 'Landlord' };
