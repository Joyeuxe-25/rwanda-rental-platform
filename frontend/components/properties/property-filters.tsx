'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select-native';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PROPERTY_FILTER_KEYS } from '@/lib/properties';
import { PROPERTY_TYPE_LABELS } from '@/types/property';

/** Sheet filter keys = documented filters minus the free-text `q` (in toolbar). */
const SHEET_KEYS = PROPERTY_FILTER_KEYS.filter((k) => k !== 'q');
type Filters = Partial<Record<(typeof SHEET_KEYS)[number], string>>;

function readFilters(sp: URLSearchParams): Filters {
  const f: Filters = {};
  for (const k of SHEET_KEYS) {
    const v = sp.get(k);
    if (v) f[k] = v;
  }
  return f;
}

/**
 * Marketplace filter controls (F2-R). All state lives in the URL query string
 * (shareable; browser back/forward restores it). Only the documented B17
 * parameter names are ever written. Changing any filter/search/sort resets the
 * page to 1. The full filter set lives in an accessible Sheet (works on all
 * viewports); search + sort stay in the toolbar.
 */
export function PropertyFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = React.useState(searchParams.get('q') ?? '');
  const [sort, setSort] = React.useState(searchParams.get('sort') ?? 'newest');
  const [draft, setDraft] = React.useState<Filters>(() => readFilters(searchParams));
  const [open, setOpen] = React.useState(false);

  // Keep controls in sync with the URL (back/forward, clear, external links).
  React.useEffect(() => {
    setQ(searchParams.get('q') ?? '');
    setSort(searchParams.get('sort') ?? 'newest');
    setDraft(readFilters(searchParams));
  }, [searchParams]);

  const activeCount =
    Object.values(readFilters(searchParams)).filter(Boolean).length +
    (searchParams.get('q') ? 1 : 0);

  function push(filters: Filters, qValue: string, sortValue: string) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v && v.trim()) usp.set(k, v.trim());
    }
    if (qValue.trim()) usp.set('q', qValue.trim());
    if (sortValue && sortValue !== 'newest') usp.set('sort', sortValue);
    // page resets to 1 on any change (default 1 is omitted for clean URLs).
    const s = usp.toString();
    router.push(s ? `/properties?${s}` : '/properties');
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    push(readFilters(searchParams), q, sort);
  }
  function onSortChange(next: string) {
    setSort(next);
    push(readFilters(searchParams), q, next);
  }
  function onApply() {
    push(draft, q, sort);
    setOpen(false);
  }
  function onClear() {
    setQ('');
    setSort('newest');
    setDraft({});
    router.push('/properties');
    setOpen(false);
  }

  const set = (k: (typeof SHEET_KEYS)[number], v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form role="search" onSubmit={onSearchSubmit} className="flex flex-1 gap-2">
          <div className="flex-1">
            <Label htmlFor="q" className="sr-only">
              Search properties
            </Label>
            <Input
              id="q"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by title, area, or keyword…"
              autoComplete="off"
            />
          </div>
          <Button type="submit" className="gap-2">
            <Search className="size-4" />
            <span className="hidden sm:inline">Search</span>
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <Label htmlFor="sort" className="sr-only">
            Sort
          </Label>
          <NativeSelect
            id="sort"
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            className="w-auto"
            aria-label="Sort properties"
          >
            <option value="newest">Newest</option>
            <option value="rent_asc">Lowest rent</option>
            <option value="rent_desc">Highest rent</option>
          </NativeSelect>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-2">
                <SlidersHorizontal className="size-4" />
                Filters
                {activeCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Filter properties</SheetTitle>
                <SheetDescription>
                  Narrow results by location, type, price, and size.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="f-province" label="Province">
                  <Input
                    id="f-province"
                    value={draft.province ?? ''}
                    onChange={(e) => set('province', e.target.value)}
                  />
                </Field>
                <Field id="f-district" label="District">
                  <Input
                    id="f-district"
                    value={draft.district ?? ''}
                    onChange={(e) => set('district', e.target.value)}
                  />
                </Field>
                <Field id="f-sector" label="Sector">
                  <Input
                    id="f-sector"
                    value={draft.sector ?? ''}
                    onChange={(e) => set('sector', e.target.value)}
                  />
                </Field>
                <Field id="f-cell" label="Cell">
                  <Input
                    id="f-cell"
                    value={draft.cell ?? ''}
                    onChange={(e) => set('cell', e.target.value)}
                  />
                </Field>
                <Field id="f-village" label="Village / Area">
                  <Input
                    id="f-village"
                    value={draft.villageOrArea ?? ''}
                    onChange={(e) => set('villageOrArea', e.target.value)}
                  />
                </Field>
                <Field id="f-type" label="Property type">
                  <NativeSelect
                    id="f-type"
                    value={draft.propertyType ?? ''}
                    onChange={(e) => set('propertyType', e.target.value)}
                  >
                    <option value="">Any type</option>
                    {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="f-status" label="Availability">
                  <NativeSelect
                    id="f-status"
                    value={draft.status ?? ''}
                    onChange={(e) => set('status', e.target.value)}
                  >
                    <option value="">Any status</option>
                    <option value="AVAILABLE">Available</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="UNAVAILABLE">Unavailable</option>
                  </NativeSelect>
                </Field>
                <Field id="f-bedrooms" label="Bedrooms">
                  <Input
                    id="f-bedrooms"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.bedrooms ?? ''}
                    onChange={(e) => set('bedrooms', e.target.value)}
                  />
                </Field>
                <Field id="f-bathrooms" label="Bathrooms">
                  <Input
                    id="f-bathrooms"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.bathrooms ?? ''}
                    onChange={(e) => set('bathrooms', e.target.value)}
                  />
                </Field>
                <Field id="f-minrent" label="Min rent (RWF)">
                  <Input
                    id="f-minrent"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.minRent ?? ''}
                    onChange={(e) => set('minRent', e.target.value)}
                  />
                </Field>
                <Field id="f-maxrent" label="Max rent (RWF)">
                  <Input
                    id="f-maxrent"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.maxRent ?? ''}
                    onChange={(e) => set('maxRent', e.target.value)}
                  />
                </Field>
              </div>

              <div className="mt-6 flex gap-3">
                <Button onClick={onApply} className="flex-1">
                  Apply filters
                </Button>
                <Button variant="outline" onClick={onClear} disabled={activeCount === 0}>
                  Clear
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {activeCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {activeCount} filter{activeCount === 1 ? '' : 's'} active
          </span>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
