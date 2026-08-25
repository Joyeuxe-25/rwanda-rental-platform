import type { Metadata } from 'next';

import { SecurityView } from '@/components/account/security-view';

export const metadata: Metadata = {
  title: 'Security',
  robots: { index: false, follow: false },
};

export default function SecurityPage() {
  return <SecurityView />;
}
