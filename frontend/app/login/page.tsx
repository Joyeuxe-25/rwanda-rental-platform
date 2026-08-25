import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthFormLayout } from '@/components/auth/auth-form-layout';
import { LoginForm } from '@/components/auth/login-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { safeInternalPath } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = typeof sp.returnTo === 'string' ? sp.returnTo : undefined;
  const returnTo = safeInternalPath(raw, '/');
  const changed = sp.reset === 'changed';
  const registerHref =
    returnTo !== '/' ? `/register?returnTo=${encodeURIComponent(returnTo)}` : '/register';

  return (
    <AuthFormLayout
      title="Sign in"
      description="Welcome back — sign in to your account."
      footer={
        <>
          New to the platform?{' '}
          <Link
            href={registerHref}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {changed && (
        <Alert variant="info" className="mb-4">
          <AlertDescription>
            Your password was changed. Please sign in again with your new password.
          </AlertDescription>
        </Alert>
      )}
      <LoginForm returnTo={returnTo} />
    </AuthFormLayout>
  );
}
