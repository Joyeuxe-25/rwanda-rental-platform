import * as React from 'react';

import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Centered card layout shared by the auth pages (login/register/reset/…). */
export function AuthFormLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <PageContainer size="content">
      <Section spacing="lg">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-h3">{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
          {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </Section>
    </PageContainer>
  );
}

/** Inline form error surface (safe, user-facing copy only). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
    >
      {message}
    </div>
  );
}
