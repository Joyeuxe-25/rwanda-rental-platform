import type { Metadata } from 'next';

import { MyRequestsView } from '@/components/rental-requests/my-requests-view';

export const metadata: Metadata = {
  title: 'My requests',
  robots: { index: false, follow: false },
};

export default function MyRequestsPage() {
  return <MyRequestsView />;
}
