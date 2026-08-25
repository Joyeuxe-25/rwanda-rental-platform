import type { Metadata } from 'next';

import { MyPaymentDetailView } from '@/components/payments/my-payment-detail-view';

export const metadata: Metadata = {
  title: 'Payment details',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MyPaymentDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <MyPaymentDetailView id={id} />;
}
