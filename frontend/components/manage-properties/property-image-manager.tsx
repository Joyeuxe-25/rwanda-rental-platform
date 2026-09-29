'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2 } from 'lucide-react';

import { PropertyImage } from '@/components/properties/property-image';
import { imageErrorMessage } from '@/components/manage-properties/property-management-errors';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  deletePropertyImage,
  listPropertyImages,
  reorderPropertyImages,
  setPrimaryPropertyImage,
  uploadPropertyImage,
} from '@/lib/managed-properties';
import type { ManagedImage } from '@/types/managed-property';

const MAX_IMAGES = 20;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; images: ManagedImage[] };

/**
 * Landlord image gallery manager (F11 / B5). Upload (multipart field `file`),
 * set primary, reorder (sends `{ imageIds }` only), and delete. Never sends or
 * exposes storage keys; images are rendered strictly from backend-provided
 * URLs. Client-side checks (type/size/count) mirror the backend limits for a
 * fast, friendly failure, but the backend remains authoritative.
 */
export function PropertyImageManager({ propertyId }: { propertyId: string }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const images = await listPropertyImages(propertyId);
      setState({ phase: 'ready', images });
    } catch (err) {
      setState({ phase: 'error', message: imageErrorMessage(err) });
    }
  }, [propertyId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const images = state.phase === 'ready' ? state.images : [];

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file || busy) return;

    setActionError(null);
    if (!ACCEPTED.includes(file.type)) {
      setActionError('Unsupported image type. Use a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setActionError('That image is too large. The maximum size is 5 MB.');
      return;
    }
    if (images.length >= MAX_IMAGES) {
      setActionError('This property already has the maximum of 20 images.');
      return;
    }

    setBusy(true);
    try {
      await uploadPropertyImage(propertyId, file);
      const refreshed = await listPropertyImages(propertyId);
      setState({ phase: 'ready', images: refreshed });
    } catch (err) {
      setActionError(imageErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runMutation(fn: () => Promise<ManagedImage[]>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const next = await fn();
      setState({ phase: 'ready', images: next });
    } catch (err) {
      setActionError(imageErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function setPrimary(imageId: string) {
    void runMutation(() => setPrimaryPropertyImage(propertyId, imageId));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const ids = images.map((img) => img.id);
    const moved = ids[index];
    if (moved === undefined) return;
    ids.splice(index, 1);
    ids.splice(target, 0, moved);
    void runMutation(() => reorderPropertyImages(propertyId, ids));
  }

  async function remove(imageId: string) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await deletePropertyImage(propertyId, imageId);
      const refreshed = await listPropertyImages(propertyId);
      setState({ phase: 'ready', images: refreshed });
    } catch (err) {
      setActionError(imageErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Photos</h2>
          <p className="text-sm text-muted-foreground">
            {images.length} of {MAX_IMAGES} · JPEG, PNG, or WebP, up to 5 MB each.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="sr-only"
            onChange={onPick}
            aria-hidden="true"
            tabIndex={-1}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            loading={busy}
            disabled={busy || images.length >= MAX_IMAGES}
          >
            <ImagePlus aria-hidden="true" />
            Upload photo
          </Button>
        </div>
      </div>

      {actionError && <ErrorState description={actionError} />}

      {state.phase === 'loading' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-lg" />
          ))}
        </div>
      )}

      {state.phase === 'error' && (
        <ErrorState description={state.message} onRetry={() => void load()} />
      )}

      {state.phase === 'ready' &&
        (images.length === 0 ? (
          <EmptyState
            icon={<ImagePlus className="size-6" aria-hidden="true" />}
            title="No photos yet"
            description="Add photos to help tenants picture the place. The first photo becomes the primary image."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {images.map((image, index) => (
              <li key={image.id} className="space-y-2 rounded-lg border border-border p-2">
                <div className="relative">
                  <PropertyImage
                    image={image}
                    alt={`Property photo ${index + 1}`}
                    className="aspect-[4/3] w-full rounded-md"
                  />
                  {image.isPrimary && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      <Star className="size-3" aria-hidden="true" />
                      Primary
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy || image.isPrimary}
                    onClick={() => setPrimary(image.id)}
                  >
                    <Star aria-hidden="true" />
                    {image.isPrimary ? 'Primary' : 'Set primary'}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move photo ${index + 1} earlier`}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={busy || index === images.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move photo ${index + 1} later`}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void remove(image.id)}
                    aria-label={`Delete photo ${index + 1}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
