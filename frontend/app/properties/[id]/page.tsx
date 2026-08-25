import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PropertyDetail } from '@/components/properties/property-detail';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { getPublicProperty } from '@/lib/properties';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Public property detail (F2). Server component: fetches the published property
 * from the backend (`GET /api/v1/properties/:id`) and renders it, or a designed
 * not-found page for an unknown/unpublished reference. No auth, no writes.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const property = await getPublicProperty(id).catch(() => null);
  if (!property) {
    return { title: 'Property not found', robots: { index: false } };
  }
  const location = [property.sector, property.district, property.province]
    .filter(Boolean)
    .join(', ');
  const description = property.description?.slice(0, 200) ?? `Rental in ${location}.`;
  const primary = property.images.find((i) => i.isPrimary) ?? property.images[0];
  return {
    title: property.title,
    description,
    openGraph: {
      title: property.title,
      description,
      type: 'website',
      ...(primary ? { images: [{ url: primary.url }] } : {}),
    },
  };
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const property = await getPublicProperty(id);
  if (!property) notFound();

  return (
    <PageContainer>
      <Section spacing="md">
        <PropertyDetail property={property} />
      </Section>
    </PageContainer>
  );
}
