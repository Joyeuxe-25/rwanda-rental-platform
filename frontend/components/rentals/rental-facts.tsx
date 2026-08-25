import * as React from 'react';

import { formatDate, formatMoney } from '@/lib/format';

/**
 * The money + dates block shared by tenant and landlord rental detail (F5). All
 * financial fields are server-derived (snapshotted at conversion) and read-only.
 * F5 shows NO payment information — these are the rental's terms, not a bill.
 */
export function RentalFacts({
  monthlyRent,
  securityDeposit,
  currency,
  startDate,
  endDate,
}: {
  monthlyRent: number;
  securityDeposit: number;
  currency: string;
  startDate: string;
  endDate: string | null;
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'Monthly rent', value: formatMoney(monthlyRent, currency) },
    { label: 'Security deposit', value: formatMoney(securityDeposit, currency) },
    { label: 'Start date', value: formatDate(startDate) },
    { label: 'End date', value: endDate ? formatDate(endDate) : 'Open-ended' },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs text-muted-foreground">{r.label}</dt>
          <dd className="text-sm font-medium text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
