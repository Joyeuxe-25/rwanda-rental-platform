import type { Metadata } from 'next';

import { PropertyCreateView } from '@/components/manage-properties/property-create-view';

export const metadata: Metadata = {
  title: 'Add a property',
  robots: { index: false, follow: false },
};

export default function NewPropertyPage() {
  return <PropertyCreateView />;
}
