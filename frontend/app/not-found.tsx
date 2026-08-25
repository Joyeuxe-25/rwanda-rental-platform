import Link from 'next/link';

import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { Button } from '@/components/ui/button';

/** 404 page (App Router), styled with the design system. */
export default function NotFound() {
  return (
    <PageContainer>
      <Section>
        <div className="mx-auto max-w-xl text-center">
          <p className="font-display text-5xl font-semibold text-primary">404</p>
          <h1 className="mt-3 font-display text-2xl font-semibold">Page not found</h1>
          <p className="mt-2 text-muted-foreground">
            The page you’re looking for doesn’t exist or has moved.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </Section>
    </PageContainer>
  );
}
