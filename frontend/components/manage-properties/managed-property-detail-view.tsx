'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';

import { RequireRole } from '@/components/auth/require-role';
import { PropertyImageManager } from '@/components/manage-properties/property-image-manager';
import { PublicationBadge } from '@/components/manage-properties/property-badges';
import { PropertyStatusBadge } from '@/components/properties/property-status-badge';
import { ManagedPropertyDetailSkeleton } from '@/components/manage-properties/manage-property-skeletons';
import { propertyErrorMessage } from '@/components/manage-properties/property-management-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate, formatMoney, formatMonthlyRent } from '@/lib/format';
import {
  deleteMyProperty,
  getMyProperty,
  publishMyProperty,
  unpublishMyProperty,
} from '@/lib/managed-properties';
import { PROPERTY_TYPE_LABELS } from '@/types/property';
import type { ManagedProperty } from '@/types/managed-property';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; property: ManagedProperty };

/** Landlord property management detail (F11). Landlord-only; backend enforces ownership. */
export function ManagedPropertyDetailView({ id }: { id: string }) {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Property management is available to landlords">
      <DetailContent id={id} />
    </RequireRole>
  );
}

function DetailContent({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({ phase: 'loading' });
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const property = await getMyProperty(id);
      setState({ phase: 'ready', property });
    } catch (err) {
      setState({ phase: 'error', message: propertyErrorMessage(err) });
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function togglePublish(publish: boolean) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = publish ? await publishMyProperty(id) : await unpublishMyProperty(id);
      setState({ phase: 'ready', property: updated });
    } catch (err) {
      setActionError(propertyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteMyProperty(id);
      setConfirmOpen(false);
      router.push('/landlord/properties');
    } catch (err) {
      setActionError(propertyErrorMessage(err));
      setConfirmOpen(false);
      setBusy(false);
    }
  }

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link href="/landlord/properties">
            <ArrowLeft aria-hidden="true" />
            My properties
          </Link>
        </Button>

        {state.phase === 'loading' && <ManagedPropertyDetailSkeleton />}

        {state.phase === 'error' && (
          <ErrorState description={state.message} onRetry={() => void load()} />
        )}

        {state.phase === 'ready' && (
          <ReadyDetail
            property={state.property}
            busy={busy}
            actionError={actionError}
            onPublish={() => void togglePublish(true)}
            onUnpublish={() => void togglePublish(false)}
            onRequestDelete={() => {
              setActionError(null);
              setConfirmOpen(true);
            }}
          />
        )}
      </Section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this property?</DialogTitle>
            <DialogDescription>
              This permanently removes the listing and its photos. This can’t be undone. Properties
              with related rental records can’t be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              loading={busy}
              onClick={() => void confirmDelete()}
            >
              Delete property
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function ReadyDetail({
  property,
  busy,
  actionError,
  onPublish,
  onUnpublish,
  onRequestDelete,
}: {
  property: ManagedProperty;
  busy: boolean;
  actionError: string | null;
  onPublish: () => void;
  onUnpublish: () => void;
  onRequestDelete: () => void;
}) {
  const location = [
    property.additionalLocation,
    property.village,
    property.cell,
    property.sector,
    property.district,
    property.province,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PublicationBadge isPublished={property.isPublished} />
          <PropertyStatusBadge status={property.status} />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{property.title}</h1>
        <p className="text-muted-foreground">
          {PROPERTY_TYPE_LABELS[property.propertyType]}
          {location ? ` · ${location}` : ''}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {property.isPublished ? (
            <Button variant="outline" onClick={onUnpublish} loading={busy}>
              <EyeOff aria-hidden="true" />
              Unpublish
            </Button>
          ) : (
            <Button onClick={onPublish} loading={busy}>
              <Eye aria-hidden="true" />
              Publish
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/landlord/properties/${property.id}/edit`}>
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          </Button>
          {property.isPublished && (
            <Button asChild variant="ghost">
              <Link href={`/properties/${property.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                View public listing
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onRequestDelete}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>

        {actionError && <ErrorState description={actionError} className="mt-2" />}
      </div>

      {/* Publication vs availability — explained as two distinct states. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-label">Publication</p>
            <p className="text-sm text-muted-foreground">
              {property.isPublished
                ? `Live on the marketplace since ${formatDate(property.publishedAt)}.`
                : 'Draft — not visible to tenants. Publish when you’re ready.'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-label">Availability</p>
            <p className="text-sm text-muted-foreground">
              Managed automatically based on active rentals — you don’t set this manually.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Key facts. */}
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Fact
          label="Monthly rent"
          value={formatMonthlyRent(property.monthlyRent, property.currency)}
        />
        <Fact
          label="Security deposit"
          value={formatMoney(property.securityDeposit, property.currency)}
        />
        <Fact label="Other charges" value={formatMoney(property.otherCharges, property.currency)} />
        <Fact label="Bedrooms / bathrooms" value={`${property.bedrooms} / ${property.bathrooms}`} />
      </dl>

      <div className="space-y-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">Description</h2>
        {property.description ? (
          <p className="whitespace-pre-line text-sm text-foreground/90">{property.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No description yet. A description is required before you can publish.
          </p>
        )}
      </div>

      {property.amenities.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">Amenities</h2>
          <ul className="flex flex-wrap gap-2">
            {property.amenities.map((a) => (
              <li key={a} className="rounded-full border border-border bg-muted px-3 py-1 text-sm">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PropertyImageManager propertyId={property.id} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}
