'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Property lookup by reference (id). This is the discovery affordance the public
 * backend supports today (`GET /properties/:id`) — it simply NAVIGATES to the
 * property detail page. It makes NO API call itself; the detail route fetches and
 * renders a not-found experience for unknown references. When a public
 * list/search endpoint is added, richer search UI will replace this here.
 */
export function PropertyLookup() {
  const router = useRouter();
  const [value, setValue] = React.useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = value.trim();
    if (id) router.push(`/properties/${encodeURIComponent(id)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row" role="search">
      <div className="flex-1">
        <Label htmlFor="property-ref" className="sr-only">
          Property reference
        </Label>
        <Input
          id="property-ref"
          name="ref"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter a property reference…"
          autoComplete="off"
        />
      </div>
      <Button type="submit" className="gap-2">
        <Search className="size-4" />
        Find property
      </Button>
    </form>
  );
}
