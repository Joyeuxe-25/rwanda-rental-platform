import type { Metadata } from 'next';

import { ManagedPropertiesView } from '@/components/manage-properties/managed-properties-view';

export const metadata: Metadata = {
  title: 'My properties',
  robots: { index: false, follow: false },
};

export default function ManagedPropertiesPage() {
  return <ManagedPropertiesView />;
}
