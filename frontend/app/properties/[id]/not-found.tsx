import Link from 'next/link';
import { SearchX } from 'lucide-react';

import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { Button } from '@/components/ui/button';

/** Designed not-found for an unknown/unpublished property reference. */
export default function PropertyNotFound() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-h2">Property not found</h1>
          <p className="mt-2 text-muted-foreground">
            This property may have been removed, is no longer published, or the reference is
            incorrect.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/properties">Browse properties</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </Section>
    </PageContainer>
  );
}
