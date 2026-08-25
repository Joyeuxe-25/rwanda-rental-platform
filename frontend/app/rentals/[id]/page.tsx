import type { Metadata } from 'next';

import { MyRentalDetailView } from '@/components/rentals/my-rental-detail-view';

export const metadata: Metadata = {
  title: 'Rental details',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MyRentalDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <MyRentalDetailView id={id} />;
}
