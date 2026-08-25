import * as React from 'react';

import { PropertyAmenities } from '@/components/properties/property-amenities';
import { PropertyGallery } from '@/components/properties/property-gallery';
import { PropertyLocation } from '@/components/properties/property-location';
import { PropertyMeta } from '@/components/properties/property-meta';
import { PropertyStatusBadge } from '@/components/properties/property-status-badge';
import { RequestToRentCta } from '@/components/properties/request-to-rent-cta';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatMoney, formatMonthlyRent } from '@/lib/format';
import type { PublicProperty } from '@/types/property';

/**
 * Presentational property detail (pure — takes a `PublicProperty`). The route
 * fetches the data server-side and renders this. Shows only safe public fields;
 * the landlord is name-only (no email/phone), and no storage keys are exposed.
 */
export function PropertyDetail({ property }: { property: PublicProperty }) {
  const charges: { label: string; value: string }[] = [
    { label: 'Monthly rent', value: formatMonthlyRent(property.monthlyRent, property.currency) },
    { label: 'Security deposit', value: formatMoney(property.securityDeposit, property.currency) },
  ];
  if (property.otherCharges > 0) {
    charges.push({
      label: 'Other charges',
      value: formatMoney(property.otherCharges, property.currency),
    });
  }

  return (
    <div className="space-y-8">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Properties', href: '/properties' },
          { label: property.title },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Gallery + narrative */}
        <div className="space-y-8">
          <PropertyGallery images={property.images} title={property.title} />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-h1">{property.title}</h1>
              <PropertyStatusBadge status={property.status} />
            </div>
            <PropertyLocation property={property} />
            <PropertyMeta
              propertyType={property.propertyType}
              bedrooms={property.bedrooms}
              bathrooms={property.bathrooms}
            />
          </div>

          {property.description && (
            <section aria-labelledby="about-heading" className="space-y-3">
              <h2 id="about-heading" className="text-h3">
                About this property
              </h2>
              <p className="text-body whitespace-pre-line text-muted-foreground">
                {property.description}
              </p>
            </section>
          )}

          <section aria-labelledby="amenities-heading" className="space-y-3">
            <h2 id="amenities-heading" className="text-h3">
              Amenities
            </h2>
            <PropertyAmenities amenities={property.amenities} variant="full" />
          </section>

          <section aria-labelledby="location-heading" className="space-y-3">
            <h2 id="location-heading" className="text-h3">
              Location
            </h2>
            <PropertyLocation property={property} variant="detailed" />
          </section>
        </div>

        {/* Sticky pricing / CTA panel */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="space-y-5 p-6">
              <div>
                <p className="text-caption">Monthly rent</p>
                <p className="font-display text-2xl font-semibold tracking-tight">
                  {formatMoney(property.monthlyRent, property.currency)}
                  <span className="text-base font-normal text-muted-foreground"> / month</span>
                </p>
              </div>

              <Separator />

              <dl className="space-y-2">
                {charges.slice(1).map((c) => (
                  <div key={c.label} className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">{c.label}</dt>
                    <dd className="font-medium text-foreground">{c.value}</dd>
                  </div>
                ))}
              </dl>

              <RequestToRentCta
                propertyId={property.id}
                propertyTitle={property.title}
                status={property.status}
                className="w-full"
              />

              <p className="text-caption">
                Listed by {property.landlord.firstName} {property.landlord.lastName}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
