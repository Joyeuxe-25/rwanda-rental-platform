import type { Metadata } from 'next';

import { ManagedPropertyDetailView } from '@/components/manage-properties/managed-property-detail-view';

export const metadata: Metadata = {
  title: 'Manage property',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManagePropertyPage({ params }: PageProps) {
  const { id } = await params;
  return <ManagedPropertyDetailView id={id} />;
}
