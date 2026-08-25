import * as React from 'react';
import Link from 'next/link';
import { UserRound, ChevronRight } from 'lucide-react';

import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatMoney, formatPaymentPeriod } from '@/lib/format';
import type { LandlordPayment } from '@/types/payment';

/**
 * A payment on one of the landlord's properties (F6): property, tenant name
 * (the only tenant identity the backend returns), amount, period, status, started
 * date. No tenant contact details, no mutation controls.
 */
export function LandlordPaymentCard({ payment }: { payment: LandlordPayment }) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <Link
        href={`/landlord/payments/${payment.id}`}
        className="flex items-center gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display font-semibold text-foreground">
              {payment.property.title}
            </h3>
            <PaymentStatusBadge status={payment.status} />
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
            {payment.tenant.firstName} {payment.tenant.lastName}
          </p>
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
