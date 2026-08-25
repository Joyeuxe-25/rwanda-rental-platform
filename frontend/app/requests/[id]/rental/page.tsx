import type { Metadata } from 'next';

import { RentalConversionView } from '@/components/rentals/rental-conversion-view';

export const metadata: Metadata = {
  title: 'Start rental',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Rental conversion page (F5). Server wrapper: resolves the request id and marks
 * the page noindex (private). Auth/role gating, the ACCEPTED check, and the fresh
 * property load happen client-side in the view (the backend is authoritative).
 */
export default async function StartRentalPage({ params }: PageProps) {
  const { id } = await params;
  return <RentalConversionView requestId={id} />;
}
