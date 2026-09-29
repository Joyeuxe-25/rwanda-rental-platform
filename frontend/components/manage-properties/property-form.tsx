'use client';

import * as React from 'react';
import Link from 'next/link';

import { FormError } from '@/components/auth/auth-form-layout';
import { AmenitiesEditor } from '@/components/manage-properties/amenities-editor';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select-native';
import { Textarea } from '@/components/ui/textarea';
import type { ManagedProperty, PropertyInput, PropertyUpdateInput } from '@/types/managed-property';
import type { PropertyType } from '@/types/property';

const TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'HOUSE', label: 'House' },
  { value: 'ROOM', label: 'Room' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'OTHER', label: 'Other' },
];

type StringField =
  | 'title'
  | 'description'
  | 'province'
  | 'district'
  | 'sector'
  | 'cell'
  | 'village'
  | 'additionalLocation';
type NumberField = 'bedrooms' | 'bathrooms' | 'monthlyRent' | 'securityDeposit' | 'otherCharges';

interface FormState {
  title: string;
  description: string;
  propertyType: PropertyType | '';
  bedrooms: string;
  bathrooms: string;
  monthlyRent: string;
  securityDeposit: string;
  otherCharges: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  additionalLocation: string;
  amenities: string[];
}

function initialState(p?: ManagedProperty): FormState {
  const num = (n: number | undefined) => (n === undefined || n === null ? '' : String(n));
  return {
    title: p?.title ?? '',
    description: p?.description ?? '',
    propertyType: p?.propertyType ?? '',
    bedrooms: num(p?.bedrooms),
    bathrooms: num(p?.bathrooms),
    monthlyRent: num(p?.monthlyRent),
    securityDeposit: num(p?.securityDeposit),
    otherCharges: num(p?.otherCharges),
    province: p?.province ?? '',
    district: p?.district ?? '',
    sector: p?.sector ?? '',
    cell: p?.cell ?? '',
    village: p?.village ?? '',
    additionalLocation: p?.additionalLocation ?? '',
    amenities: p?.amenities ? [...p.amenities] : [],
  };
}

/** Parse an integer field; blank → 0 for optional counts. Invalid → null. */
function toInt(value: string): number | null {
  const t = value.trim();
  if (t === '') return 0;
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

export interface PropertyFormProps {
  mode: 'create' | 'edit';
  initial?: ManagedProperty;
  cancelHref: string;
  submitting: boolean;
  serverError: string | null;
  /**
   * Called on a valid submit. `full` is the complete normalized input (used to
   * CREATE); `changed` is only the fields that differ from `initial` (used to
   * UPDATE — the backend requires at least one field and rejects unknown keys).
   */
  onSubmit: (payload: { full: PropertyInput; changed: PropertyUpdateInput }) => void;
}

/**
 * Shared create/edit property form (F11). Sends ONLY editable B4 fields — never
 * id, landlordId, status, isPublished, publishedAt, currency, or timestamps.
 * Publication and availability are managed elsewhere; this form never touches
 * them. In edit mode it submits only changed fields (no no-op PATCH).
 */
export function PropertyForm({
  mode,
  initial,
  cancelHref,
  submitting,
  serverError,
  onSubmit,
}: PropertyFormProps) {
  const [state, setState] = React.useState<FormState>(() => initialState(initial));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [noChanges, setNoChanges] = React.useState(false);

  function setString(field: StringField | 'propertyType', value: string) {
    setState((s) => ({ ...s, [field]: value }));
    setNoChanges(false);
  }
  function setNumber(field: NumberField, value: string) {
    setState((s) => ({ ...s, [field]: value }));
    setNoChanges(false);
  }

  /** Build the fully-normalized input from the current state. */
  function buildFull(): { input: PropertyInput; errs: typeof errors } {
    const errs: typeof errors = {};

    const title = state.title.trim();
    if (!title) errs.title = 'A title is required.';
    else if (title.length > 200) errs.title = 'Keep the title under 200 characters.';

    if (!state.propertyType) errs.propertyType = 'Choose a property type.';

    if (state.description.trim().length > 5000)
      errs.description = 'Keep the description under 5000 characters.';

    const counts: Record<NumberField, number> = {
      bedrooms: 0,
      bathrooms: 0,
      monthlyRent: 0,
      securityDeposit: 0,
      otherCharges: 0,
    };
    (Object.keys(counts) as NumberField[]).forEach((f) => {
      const parsed = toInt(state[f]);
      if (parsed === null) errs[f] = 'Enter a whole number (0 or more).';
      else counts[f] = parsed;
    });
    if (state.monthlyRent.trim() === '') errs.monthlyRent = 'Monthly rent is required.';

    const province = state.province.trim();
    const district = state.district.trim();
    const sector = state.sector.trim();
    if (!province) errs.province = 'Province is required.';
    if (!district) errs.district = 'District is required.';
    if (!sector) errs.sector = 'Sector is required.';

    const optional = (v: string) => (v.trim() === '' ? undefined : v.trim());

    const input: PropertyInput = {
      title,
      propertyType: (state.propertyType || 'APARTMENT') as PropertyType,
      bedrooms: counts.bedrooms,
      bathrooms: counts.bathrooms,
      monthlyRent: counts.monthlyRent,
      securityDeposit: counts.securityDeposit,
      otherCharges: counts.otherCharges,
      province,
      district,
      sector,
      amenities: state.amenities,
      ...(optional(state.description) !== undefined
        ? { description: state.description.trim() }
        : {}),
      ...(optional(state.cell) !== undefined ? { cell: state.cell.trim() } : {}),
      ...(optional(state.village) !== undefined ? { village: state.village.trim() } : {}),
      ...(optional(state.additionalLocation) !== undefined
        ? { additionalLocation: state.additionalLocation.trim() }
        : {}),
    };
    return { input, errs };
  }

  /** Compute the changed-only patch vs the initial property (edit mode). */
  function buildChanged(full: PropertyInput): PropertyUpdateInput {
    if (!initial) return { ...full };
    const changed: PropertyUpdateInput = {};

    if (full.title !== initial.title) changed.title = full.title;
    if (full.propertyType !== initial.propertyType) changed.propertyType = full.propertyType;
    if (full.bedrooms !== initial.bedrooms) changed.bedrooms = full.bedrooms;
    if (full.bathrooms !== initial.bathrooms) changed.bathrooms = full.bathrooms;
    if (full.monthlyRent !== initial.monthlyRent) changed.monthlyRent = full.monthlyRent;
    if (full.securityDeposit !== initial.securityDeposit)
      changed.securityDeposit = full.securityDeposit;
    if (full.otherCharges !== initial.otherCharges) changed.otherCharges = full.otherCharges;
    if (full.province !== initial.province) changed.province = full.province;
    if (full.district !== initial.district) changed.district = full.district;
    if (full.sector !== initial.sector) changed.sector = full.sector;

    // Optional strings: compare normalized ('' from the form == null on the record).
    const desc = full.description ?? '';
    if (desc !== (initial.description ?? '')) changed.description = full.description ?? '';
    const cell = full.cell ?? '';
    if (cell !== (initial.cell ?? '')) changed.cell = full.cell ?? '';
    const village = full.village ?? '';
    if (village !== (initial.village ?? '')) changed.village = full.village ?? '';
    const addl = full.additionalLocation ?? '';
    if (addl !== (initial.additionalLocation ?? ''))
      changed.additionalLocation = full.additionalLocation ?? '';

    const sameAmenities =
      full.amenities.length === initial.amenities.length &&
      full.amenities.every((a, i) => a === initial.amenities[i]);
    if (!sameAmenities) changed.amenities = full.amenities;

    return changed;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const { input, errs } = buildFull();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (mode === 'edit') {
      const changed = buildChanged(input);
      if (Object.keys(changed).length === 0) {
        setNoChanges(true);
        return;
      }
      onSubmit({ full: input, changed });
    } else {
      onSubmit({ full: input, changed: { ...input } });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <FormError message={serverError} />

      <FormField id="pf-title" label="Title" required error={errors.title}>
        {(p) => (
          <Input
            value={state.title}
            onChange={(e) => setString('title', e.target.value)}
            maxLength={200}
            required
            {...p}
          />
        )}
      </FormField>

      <FormField id="pf-type" label="Property type" required error={errors.propertyType}>
        {(p) => (
          <NativeSelect
            value={state.propertyType}
            onChange={(e) => setString('propertyType', e.target.value)}
            required
            {...p}
          >
            <option value="" disabled>
              Select a type…
            </option>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>

      <FormField
        id="pf-description"
        label="Description"
        error={errors.description}
        helperText="A description is required before you can publish the listing."
      >
        {(p) => (
          <Textarea
            value={state.description}
            onChange={(e) => setString('description', e.target.value)}
            rows={5}
            maxLength={5000}
            {...p}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="pf-bedrooms" label="Bedrooms" error={errors.bedrooms}>
          {(p) => (
            <Input
              inputMode="numeric"
              value={state.bedrooms}
              onChange={(e) => setNumber('bedrooms', e.target.value)}
              {...p}
            />
          )}
        </FormField>
        <FormField id="pf-bathrooms" label="Bathrooms" error={errors.bathrooms}>
          {(p) => (
            <Input
              inputMode="numeric"
              value={state.bathrooms}
              onChange={(e) => setNumber('bathrooms', e.target.value)}
              {...p}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="pf-rent" label="Monthly rent (RWF)" required error={errors.monthlyRent}>
          {(p) => (
            <Input
              inputMode="numeric"
              value={state.monthlyRent}
              onChange={(e) => setNumber('monthlyRent', e.target.value)}
              required
              {...p}
            />
          )}
        </FormField>
        <FormField id="pf-deposit" label="Security deposit (RWF)" error={errors.securityDeposit}>
          {(p) => (
            <Input
              inputMode="numeric"
              value={state.securityDeposit}
              onChange={(e) => setNumber('securityDeposit', e.target.value)}
              {...p}
            />
          )}
        </FormField>
        <FormField id="pf-other" label="Other charges (RWF)" error={errors.otherCharges}>
          {(p) => (
            <Input
              inputMode="numeric"
              value={state.otherCharges}
              onChange={(e) => setNumber('otherCharges', e.target.value)}
              {...p}
            />
          )}
        </FormField>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-label">Location</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="pf-province" label="Province" required error={errors.province}>
            {(p) => (
              <Input
                value={state.province}
                onChange={(e) => setString('province', e.target.value)}
                required
                {...p}
              />
            )}
          </FormField>
          <FormField id="pf-district" label="District" required error={errors.district}>
            {(p) => (
              <Input
                value={state.district}
                onChange={(e) => setString('district', e.target.value)}
                required
                {...p}
              />
            )}
          </FormField>
          <FormField id="pf-sector" label="Sector" required error={errors.sector}>
            {(p) => (
              <Input
                value={state.sector}
                onChange={(e) => setString('sector', e.target.value)}
                required
                {...p}
              />
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pf-cell" label="Cell" error={errors.cell}>
            {(p) => (
              <Input
                value={state.cell}
                onChange={(e) => setString('cell', e.target.value)}
                {...p}
              />
            )}
          </FormField>
          <FormField id="pf-village" label="Village / area" error={errors.village}>
            {(p) => (
              <Input
                value={state.village}
                onChange={(e) => setString('village', e.target.value)}
                {...p}
              />
            )}
          </FormField>
        </div>
        <FormField
          id="pf-addl"
          label="Additional location details"
          error={errors.additionalLocation}
        >
          {(p) => (
            <Textarea
              value={state.additionalLocation}
              onChange={(e) => setString('additionalLocation', e.target.value)}
              rows={2}
              maxLength={500}
              {...p}
            />
          )}
        </FormField>
      </fieldset>

      <AmenitiesEditor
        amenities={state.amenities}
        onChange={(next) => {
          setState((s) => ({ ...s, amenities: next }));
          setNoChanges(false);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={submitting}>
          {mode === 'create' ? 'Create property' : 'Save changes'}
        </Button>
        <Button asChild variant="ghost" type="button">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        {noChanges && <span className="text-sm text-muted-foreground">No changes to save</span>}
      </div>
    </form>
  );
}
