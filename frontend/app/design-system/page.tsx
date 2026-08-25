'use client';

import * as React from 'react';
import { Info, Home } from 'lucide-react';

import { Grid } from '@/components/layout/grid';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { Stack } from '@/components/layout/stack';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { CardSkeleton, TextSkeleton } from '@/components/shared/loading-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const swatches = [
  { name: 'Primary', className: 'bg-primary', hex: '#273469' },
  { name: 'Secondary', className: 'bg-secondary', hex: '#7A9B76' },
  { name: 'Accent', className: 'bg-accent', hex: '#C96A4A' },
  { name: 'Background', className: 'bg-background border', hex: '#F7F4EE' },
  { name: 'Surface', className: 'bg-card border', hex: '#FFFFFF' },
  { name: 'Success', className: 'bg-success', hex: '#3F7D58' },
  { name: 'Warning', className: 'bg-warning', hex: '#C58A32' },
  { name: 'Error', className: 'bg-destructive', hex: '#B84C4C' },
];

export default function DesignSystemPage() {
  const [loading, setLoading] = React.useState(false);

  return (
    <TooltipProvider>
      <PageContainer>
        <Section spacing="sm">
          <Breadcrumb
            items={[{ label: 'Home', href: '/' }, { label: 'Design system' }]}
            className="mb-4"
          />
          <h1 className="text-h1">Design system</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            A development reference for the Organic Modernism design system. Not a product page — it
            renders no business data and makes no API calls.
          </p>
        </Section>

        <Separator />

        <Section title="Colors" headingId="colors">
          <Grid cols={4} gap="sm">
            {swatches.map((s) => (
              <div key={s.name} className="space-y-2">
                <div
                  className={`h-16 w-full rounded-md border-border ${s.className}`}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-caption">{s.hex}</p>
                </div>
              </div>
            ))}
          </Grid>
        </Section>

        <Separator />

        <Section title="Typography" headingId="typography">
          <Stack gap="sm">
            <p className="text-display">Display</p>
            <h3 className="text-h1">Heading 1</h3>
            <h3 className="text-h2">Heading 2</h3>
            <h3 className="text-h3">Heading 3</h3>
            <h3 className="text-h4">Heading 4</h3>
            <p className="text-body-lg">Body large — calm, readable, editorial.</p>
            <p className="text-body">Body — the default reading size.</p>
            <p className="text-body-sm">Body small — dense supporting text.</p>
            <p className="text-caption">Caption — metadata and hints.</p>
          </Stack>
        </Section>

        <Separator />

        <Section title="Buttons" headingId="buttons">
          <Stack gap="lg">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button disabled>Disabled</Button>
              <Button loading={loading} onClick={() => setLoading((v) => !v)}>
                {loading ? 'Loading' : 'Toggle loading'}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" aria-label="Home">
                    <Home />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Home</TooltipContent>
              </Tooltip>
            </div>
          </Stack>
        </Section>

        <Separator />

        <Section title="Form controls" headingId="forms">
          <div className="grid max-w-xl gap-5">
            <FormField
              id="ds-name"
              label="Full name"
              required
              helperText="As it appears on your ID."
            >
              {(p) => <Input placeholder="Jean Uwimana" {...p} />}
            </FormField>
            <FormField id="ds-email" label="Email" error="Enter a valid email address.">
              {(p) => <Input type="email" defaultValue="not-an-email" {...p} />}
            </FormField>
            <FormField id="ds-msg" label="Message">
              {(p) => <Textarea placeholder="Tell us a little about what you need…" {...p} />}
            </FormField>
            <div className="flex items-center gap-2">
              <Checkbox id="ds-terms" defaultChecked />
              <Label htmlFor="ds-terms">I agree to the platform guidelines</Label>
            </div>
          </div>
        </Section>

        <Separator />

        <Section title="Cards" headingId="cards">
          <Grid cols={3}>
            <Card>
              <CardHeader>
                <CardTitle>Card title</CardTitle>
                <CardDescription>Restrained radius, soft shadow, clean surface.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Card content area with generous internal spacing.
              </CardContent>
            </Card>
            <CardSkeleton />
            <Card>
              <CardHeader>
                <CardTitle>Text skeleton</CardTitle>
              </CardHeader>
              <CardContent>
                <TextSkeleton lines={4} />
              </CardContent>
            </Card>
          </Grid>
        </Section>

        <Separator />

        <Section title="Badges &amp; status" headingId="badges">
          <Stack gap="lg">
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="neutral">Neutral</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="destructive">Error</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="success" label="AVAILABLE" />
              <StatusBadge tone="neutral" label="OCCUPIED" />
              <StatusBadge tone="pending" label="PENDING" />
              <StatusBadge tone="success" label="ACCEPTED" />
              <StatusBadge tone="error" label="REJECTED" />
              <StatusBadge tone="success" label="SUCCESSFUL" />
              <StatusBadge tone="error" label="FAILED" />
              <StatusBadge tone="info" label="INITIATED" />
            </div>
            <p className="text-caption">Status meaning uses an icon + label — never color alone.</p>
          </Stack>
        </Section>

        <Separator />

        <Section title="Alerts" headingId="alerts">
          <Stack gap="md" className="max-w-2xl">
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertTitle>Information</AlertTitle>
              <AlertDescription>A neutral, helpful message.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <Info aria-hidden="true" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Your action completed.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <Info aria-hidden="true" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>Please review before continuing.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <Info aria-hidden="true" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>Something needs your attention.</AlertDescription>
            </Alert>
          </Stack>
        </Section>

        <Separator />

        <Section title="States" headingId="states">
          <Grid cols={2}>
            <EmptyState
              title="No properties yet"
              description="When listings are added, they'll appear here."
              action={<Button size="sm">Add a listing</Button>}
            />
            <ErrorState
              description="We couldn't load this section. Please try again."
              onRetry={() => {}}
            />
          </Grid>
        </Section>

        <Separator />

        <Section title="Dialog" headingId="dialog" className="pb-16">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog title</DialogTitle>
                <DialogDescription>
                  An accessible modal built on Radix — Escape closes, focus is trapped and restored.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>Confirm</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>
      </PageContainer>
    </TooltipProvider>
  );
}
