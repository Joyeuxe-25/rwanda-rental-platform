import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatMoney, formatPaymentPeriod } from '@/lib/format';
import type { TenantPayment } from '@/types/payment';

/**
 * A tenant's own payment in the list (F6): property, amount, period, status,
 * started date. Text-first (the B8 payment summary carries no image). Never shows
 * landlord contact details or provider secrets.
 */
export function TenantPaymentCard({ payment }: { payment: TenantPayment }) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <Link
        href={`/payments/${payment.id}`}
        className="flex items-center gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display font-semibold text-foreground">
              {payment.property.title}
            </h3>
            <PaymentStatusBadge status={payment.status} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {formatMoney(payment.amount, payment.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatPaymentPeriod(payment.paymentPeriod)}
          </p>
          <p className="text-xs text-muted-foreground">Started {formatDate(payment.createdAt)}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </Card>
  );
}
