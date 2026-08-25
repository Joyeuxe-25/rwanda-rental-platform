import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthFormLayout } from '@/components/auth/auth-form-layout';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : '';

  return (
    <AuthFormLayout
      title="Reset your password"
      description="Choose a new password for your account."
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthFormLayout>
  );
}
