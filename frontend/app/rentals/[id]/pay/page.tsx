import type { Metadata } from 'next';

import { PaymentCreateView } from '@/components/payments/payment-create-view';

export const metadata: Metadata = {
  title: 'Pay rent',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Payment page (F6). Server wrapper: resolves the rental id and marks the page
 * noindex (private). Auth/role gating, the ACTIVE check, and the payment form run
 * client-side (the backend is authoritative; MTN is initiated server-side only).
 */
export default async function PayRentPage({ params }: PageProps) {
  const { id } = await params;
  return <PaymentCreateView rentalId={id} />;
}
