import type { Metadata } from 'next';

import { MyPaymentsView } from '@/components/payments/my-payments-view';

export const metadata: Metadata = {
  title: 'Payments',
  robots: { index: false, follow: false },
};

export default function MyPaymentsPage() {
  return <MyPaymentsView />;
}
