'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { PropertyImage } from '@/components/properties/property-image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PublicImage } from '@/types/property';

/**
 * Responsive, keyboard-accessible property gallery. Shows a primary image with
 * thumbnails; clicking opens a labelled lightbox (Radix Dialog) with prev/next
 * controls (ArrowLeft/ArrowRight also navigate). Falls back gracefully when
 * there are no images. Only backend-provided image URLs are used.
 */
export function PropertyGallery({ images, title }: { images: PublicImage[]; title: string }) {
  const ordered = React.useMemo(
    () =>
      [...(images ?? [])].sort(
        (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
      ),
    [images],
  );
  const [active, setActive] = React.useState(0);
  const count = ordered.length;

  const go = React.useCallback(
    (dir: 1 | -1) => setActive((i) => (count ? (i + dir + count) % count : 0)),
    [count],
  );

  if (count === 0) {
    return (
      <PropertyImage
        image={null}
        alt={title}
        className="aspect-[16/10] w-full rounded-lg"
        loading="eager"
      />
    );
  }

  const current = ordered[active]!;

  return (
    <div className="space-y-3">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="block w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`View image ${active + 1} of ${count} for ${title}, larger`}
          >
            <PropertyImage
              image={current}
              alt={`${title} — image ${active + 1} of ${count}`}
              className="aspect-[16/10] w-full"
              loading="eager"
            />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">
            {title} — image {active + 1} of {count}
          </DialogTitle>
          <div className="relative">
            <PropertyImage
              image={current}
              alt={`${title} — image ${active + 1} of ${count}`}
              className="aspect-[16/10] w-full rounded-md"
              loading="eager"
            />
            {count > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => go(-1)}>
                  <ChevronLeft /> Previous
                </Button>
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {active + 1} / {count}
                </span>
                <Button variant="outline" size="sm" onClick={() => go(1)}>
                  Next <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={`${title} thumbnails`}>
          {ordered.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === active ? 'true' : undefined}
                className={cn(
                  'overflow-hidden rounded-md ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  i === active ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100',
                )}
              >
                <PropertyImage image={img} alt="" className="size-16" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
