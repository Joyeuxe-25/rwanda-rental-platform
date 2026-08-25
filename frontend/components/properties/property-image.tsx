'use client';

import * as React from 'react';
import { ImageOff } from 'lucide-react';

import { toApiUrl } from '@/lib/env';
import { cn } from '@/lib/utils';
import type { PublicImage } from '@/types/property';

export interface PropertyImageProps {
  image?: PublicImage | null;
  alt: string;
  className?: string;
  /** Native lazy-loading hint (default lazy; pass 'eager' for above-the-fold). */
  loading?: 'lazy' | 'eager';
  sizes?: string;
}

/**
 * Renders a backend-served property image with a designed fallback for the
 * "no image" and "failed to load" cases (never a broken-image icon alone).
 * Uses a plain <img> because images are served by the API at a dynamic origin
 * (not a Next-optimizable static host); the aspect-ratio box prevents layout
 * shift. Only backend-provided URLs are used — never an arbitrary storage key.
 */
export function PropertyImage({ image, alt, className, loading = 'lazy' }: PropertyImageProps) {
  const [failed, setFailed] = React.useState(false);
  const src = image ? toApiUrl(image.url) : null;
  const showFallback = !src || failed;

  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {showFallback ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOff className="size-8" aria-hidden="true" />
          <span className="text-xs">No image available</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
