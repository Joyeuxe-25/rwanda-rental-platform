import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Accessible avatar with an initials fallback (F8). The backend exposes
 * `profileImageKey` but currently offers NO public profile-image serving/upload
 * endpoint, so we never fabricate an image URL — the avatar is always initials
 * (first letter of first + last name). It is announced as an image with the
 * user's full name.
 */
function initials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-xl',
} as const;

export function UserAvatar({
  firstName,
  lastName,
  size = 'md',
  className,
}: {
  firstName: string;
  lastName: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const name = `${firstName} ${lastName}`.trim();
  return (
    <span
      role="img"
      aria-label={name ? `${name} avatar` : 'User avatar'}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary/10 font-semibold text-primary',
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden="true">{initials(firstName, lastName)}</span>
    </span>
  );
}
