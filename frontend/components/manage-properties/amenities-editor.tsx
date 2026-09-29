'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAX_AMENITIES = 30;
const MAX_LENGTH = 50;

/**
 * Multi-value amenities editor (F11). Amenities are a `string[]` (B4: max 30,
 * each 1–50 chars). Add with the button or Enter; remove with the chip's ✕.
 * Duplicates and blanks are ignored. Emits the full array on every change.
 */
export function AmenitiesEditor({
  amenities,
  onChange,
}: {
  amenities: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = React.useState('');
  const atLimit = amenities.length >= MAX_AMENITIES;

  function add() {
    const value = draft.trim().slice(0, MAX_LENGTH);
    if (!value || atLimit) return;
    if (amenities.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...amenities, value]);
    setDraft('');
  }

  function remove(index: number) {
    onChange(amenities.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="pf-amenity-input">Amenities</Label>
      <div className="flex gap-2">
        <Input
          id="pf-amenity-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          maxLength={MAX_LENGTH}
          placeholder="e.g. Parking, Water tank, WiFi"
          disabled={atLimit}
          aria-describedby="pf-amenity-help"
        />
        <Button type="button" variant="outline" onClick={add} disabled={atLimit || !draft.trim()}>
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>
      <p id="pf-amenity-help" className="text-sm text-muted-foreground">
        {atLimit
          ? 'You’ve reached the maximum of 30 amenities.'
          : 'Press Enter or Add to include an amenity.'}
      </p>

      {amenities.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-1">
          {amenities.map((amenity, index) => (
            <li key={`${amenity}-${index}`}>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-sm">
                {amenity}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${amenity}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
