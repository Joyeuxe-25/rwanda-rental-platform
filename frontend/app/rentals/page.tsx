import type { Metadata } from 'next';

import { MyRentalsView } from '@/components/rentals/my-rentals-view';

export const metadata: Metadata = {
  title: 'My rentals',
  robots: { index: false, follow: false },
};

export default function MyRentalsPage() {
  return <MyRentalsView />;
}
