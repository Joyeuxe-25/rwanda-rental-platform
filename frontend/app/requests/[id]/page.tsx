import type { Metadata } from 'next';

import { MyRequestDetailView } from '@/components/rental-requests/my-request-detail-view';

export const metadata: Metadata = {
  title: 'Request details',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MyRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <MyRequestDetailView id={id} />;
}
