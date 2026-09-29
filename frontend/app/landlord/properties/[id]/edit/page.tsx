import type { Metadata } from 'next';

import { PropertyEditView } from '@/components/manage-properties/property-edit-view';

export const metadata: Metadata = {
  title: 'Edit property',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPropertyPage({ params }: PageProps) {
  const { id } = await params;
  return <PropertyEditView id={id} />;
}
