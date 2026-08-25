import type { Metadata } from 'next';

import { LandlordRequestDetailView } from '@/components/rental-requests/landlord-request-detail-view';

export const metadata: Metadata = {
  title: 'Request details',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LandlordRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <LandlordRequestDetailView id={id} />;
}
