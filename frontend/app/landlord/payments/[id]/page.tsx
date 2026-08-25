import type { Metadata } from 'next';

import { LandlordPaymentDetailView } from '@/components/payments/landlord-payment-detail-view';

export const metadata: Metadata = {
  title: 'Payment details',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LandlordPaymentDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <LandlordPaymentDetailView id={id} />;
}
