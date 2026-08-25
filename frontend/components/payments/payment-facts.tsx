import * as React from 'react';

import { formatDate, formatMoney, formatPaymentPeriod } from '@/lib/format';
import type { PaymentProviderName } from '@/types/payment';

const PROVIDER_LABEL: Record<PaymentProviderName, string> = {
  MTN_MOMO: 'MTN Mobile Money',
  AIRTEL_MONEY: 'Airtel Money',
};

/**
 * The payment facts block shared by tenant and landlord detail (F6). All fields
 * are server-derived and read-only. `providerTransactionId` is our own safe
 * reference (never an MTN secret or raw provider payload) and is only shown when
 * present. Completed date appears only once the backend records it.
 */
export function PaymentFacts({
  amount,
  currency,
  paymentPeriod,
  provider,
  createdAt,
  completedAt,
  reference,
}: {
  amount: number;
  currency: string;
  paymentPeriod: string;
  provider: PaymentProviderName;
  createdAt: string;
  completedAt: string | null;
  reference: string | null;
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'Amount', value: formatMoney(amount, currency) },
    { label: 'Payment period', value: formatPaymentPeriod(paymentPeriod) },
    { label: 'Provider', value: PROVIDER_LABEL[provider] ?? provider },
    { label: 'Started', value: formatDate(createdAt) },
  ];
  if (completedAt) rows.push({ label: 'Completed', value: formatDate(completedAt) });
  if (reference) rows.push({ label: 'Reference', value: reference });

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs text-muted-foreground">{r.label}</dt>
          <dd className="break-words text-sm font-medium text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
