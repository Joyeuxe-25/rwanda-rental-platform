import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthFormLayout } from '@/components/auth/auth-form-layout';
import { RegisterForm } from '@/components/auth/register-form';
import { safeInternalPath } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = typeof sp.returnTo === 'string' ? sp.returnTo : undefined;
  const returnTo = safeInternalPath(raw, '/');
  const loginHref = returnTo !== '/' ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';

  return (
    <AuthFormLayout
      title="Create your account"
      description="Join to browse rentals or list your property."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={loginHref}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm returnTo={returnTo} />
    </AuthFormLayout>
  );
}
