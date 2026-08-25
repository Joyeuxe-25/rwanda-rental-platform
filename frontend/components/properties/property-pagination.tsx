import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PropertyListParams } from '@/lib/properties';
import { cn } from '@/lib/utils';

/** Build `/properties?…` preserving all current params, with a given page. */
function hrefForPage(params: PropertyListParams, page: number): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || k === 'page' || k === 'limit') continue;
    if (k === 'sort' && v === 'newest') continue; // default omitted
    usp.set(k, String(v));
  }
  if (page > 1) usp.set('page', String(page));
  const s = usp.toString();
  return s ? `/properties?${s}` : '/properties';
}

/**
 * Accessible marketplace pagination (server-rendered links preserve filters and
 * are shareable/crawlable). Previous is disabled on the first page, Next on the
 * last. Hidden entirely when there is only one page.
 */
export function PropertyPagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: PropertyListParams;
}) {
  if (totalPages <= 1) return null;
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-6"
    >
      <PagerLink href={hrefForPage(params, page - 1)} disabled={isFirst} rel="prev">
        <ChevronLeft className="size-4" />
        Previous
      </PagerLink>

      <span className="text-sm text-muted-foreground" aria-current="page">
        Page {page} of {totalPages}
      </span>

      <PagerLink href={hrefForPage(params, page + 1)} disabled={isLast} rel="next">
        Next
        <ChevronRight className="size-4" />
      </PagerLink>
    </nav>
  );
}

function PagerLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled: boolean;
  rel: 'prev' | 'next';
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground opacity-50',
        )}
      >
        {children}
      </span>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href} rel={rel} className="gap-1.5">
        {children}
      </Link>
    </Button>
  );
}
