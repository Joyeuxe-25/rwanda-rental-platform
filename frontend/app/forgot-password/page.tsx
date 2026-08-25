import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthFormLayout } from '@/components/auth/auth-form-layout';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthFormLayout
      title="Forgot your password?"
      description="Enter your email and we'll send reset instructions."
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthFormLayout>
  );
}
