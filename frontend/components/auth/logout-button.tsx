'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { useAuth } from '@/components/auth/auth-provider';
import { Button, type ButtonProps } from '@/components/ui/button';

/** Signs the user out (server-side revoke + clear local state), then goes home. */
export function LogoutButton({
  variant = 'ghost',
  size = 'sm',
  className,
  onDone,
}: {
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  onDone?: () => void;
}) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    await signOut();
    onDone?.();
    router.push('/');
    router.refresh();
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={busy}
      onClick={handleClick}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
