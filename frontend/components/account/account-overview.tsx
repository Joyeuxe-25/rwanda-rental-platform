'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pencil, ShieldCheck } from 'lucide-react';

import { useAuth } from '@/components/auth/auth-provider';
import { AccountShell } from '@/components/account/account-shell';
import { ROLE_LABEL } from '@/components/account/account-links';
import { UserAvatar } from '@/components/account/user-avatar';
import { LogoutButton } from '@/components/auth/logout-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function memberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d);
}

/** Account overview (F8): profile summary + links to edit profile / security. */
export function AccountOverview() {
  return (
    <AccountShell title="Your account">
      <OverviewContent />
    </AccountShell>
  );
}

function OverviewContent() {
  const { user } = useAuth();
  if (!user) return null; // RequireAuth guarantees authenticated; defensive.

  const since = memberSince(user.createdAt);
  const rows: { label: string; value: string }[] = [
    { label: 'Email', value: user.email },
    { label: 'Phone', value: user.phone },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <UserAvatar firstName={user.firstName} lastName={user.lastName} size="lg" />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-h3 truncate">
                {user.firstName} {user.lastName}
              </h2>
              <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
            </div>
            {since && <p className="text-sm text-muted-foreground">Member since {since}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-muted-foreground">{r.label}</dt>
                <dd className="break-all text-right text-sm font-medium text-foreground">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/account/profile">
                <Pencil className="size-4" />
                Edit profile
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/account/security">
                <ShieldCheck className="size-4" />
                Security
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Signing out ends this session on this device.
          </p>
          <Separator />
          <LogoutButton variant="outline" />
        </CardContent>
      </Card>
    </div>
  );
}
