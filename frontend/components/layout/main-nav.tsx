import * as React from 'react';

import { NavLink } from '@/components/layout/nav-link';
import { primaryNav } from '@/lib/nav';

/** Desktop primary navigation (hidden on small screens by the header). */
export function MainNav() {
  return (
    <nav aria-label="Primary" className="flex items-center gap-6">
      {primaryNav.map((item) => (
        <NavLink key={item.href} href={item.href}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
