import type { Metadata } from 'next';

import { ProfileView } from '@/components/account/profile-view';

export const metadata: Metadata = {
  title: 'Edit profile',
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileView />;
}
