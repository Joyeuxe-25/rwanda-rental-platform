import type { Metadata } from 'next';

import { LandlordRequestsView } from '@/components/rental-requests/landlord-requests-view';

export const metadata: Metadata = {
  title: 'Rental requests',
  robots: { index: false, follow: false },
};

export default function LandlordRequestsPage() {
  return <LandlordRequestsView />;
}
