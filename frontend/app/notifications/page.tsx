import type { Metadata } from 'next';

import { NotificationsView } from '@/components/notifications/notifications-view';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationsView />;
}
