import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { LoadingState } from '@/components/shared/loading-state';

/** Route-level loading UI (App Router). Matches the design system. */
export default function Loading() {
  return (
    <PageContainer>
      <Section>
        <LoadingState />
      </Section>
    </PageContainer>
  );
}
