import { PropertyDetailSkeleton } from '@/components/properties/property-detail-skeleton';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';

export default function Loading() {
  return (
    <PageContainer>
      <Section spacing="md">
        <PropertyDetailSkeleton />
      </Section>
    </PageContainer>
  );
}
