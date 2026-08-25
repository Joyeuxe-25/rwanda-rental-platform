import type { Metadata } from 'next';

import { RentalRequestCreateView } from '@/components/rental-requests/rental-request-create-view';

export const metadata: Metadata = {
  title: 'Request to rent',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Rental-request page (F4). Server wrapper: it only resolves the route param and
 * marks the page noindex (private). Auth/role gating and the fresh property load
 * happen client-side in the view (the backend is the final authority).
 */
export default async function RequestToRentPage({ params }: PageProps) {
  const { id } = await params;
  return <RentalRequestCreateView propertyId={id} />;
}
