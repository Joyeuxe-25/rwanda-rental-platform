import type { Metadata } from 'next';

import { LandlordRentalDetailView } from '@/components/rentals/landlord-rental-detail-view';

export const metadata: Metadata = {
  title: 'Rental details',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LandlordRentalDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <LandlordRentalDetailView id={id} />;
}
