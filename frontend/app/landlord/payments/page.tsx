import type { Metadata } from 'next';

import { LandlordPaymentsView } from '@/components/payments/landlord-payments-view';

export const metadata: Metadata = {
  title: 'Payments',
  robots: { index: false, follow: false },
};

export default function LandlordPaymentsPage() {
  return <LandlordPaymentsView />;
}
