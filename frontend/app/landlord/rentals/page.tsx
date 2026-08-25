import type { Metadata } from 'next';

import { LandlordRentalsView } from '@/components/rentals/landlord-rentals-view';

export const metadata: Metadata = {
  title: 'Rentals',
  robots: { index: false, follow: false },
};

export default function LandlordRentalsPage() {
  return <LandlordRentalsView />;
}
