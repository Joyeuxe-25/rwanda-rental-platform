'use client';

import * as React from 'react';
import Link from 'next/link';
import { RefreshCw, CheckCircle2, Clock } from 'lucide-react';

import { RequireRole } from '@/components/auth/require-role';
import { PaymentFacts } from '@/components/payments/payment-facts';
import { PaymentPropertySummaryBlock } from '@/components/payments/payment-property-summary';
import {
  PaymentStatusBadge,
  PAYMENT_STATUS_TEXT,
} from '@/components/payments/payment-status-badge';
import { PaymentDetailSkeleton } from '@/components/payments/payment-skeletons';
import { paymentErrorMessage } from '@/components/payments/payment-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api';
import { getMyPayment } from '@/lib/payments';
import type { TenantPayment } from '@/types/payment';

type State =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; payment: TenantPayment };

/** Tenant payment detail (F6). Tenant-only; read-only with explicit status
 * refresh. Status is server-authoritative — there is no client mutation. */
export function MyPaymentDetailView({ id }: { id: string }) {
  return (
    <RequireRole role="TENANT" forbiddenTitle="Payments are available to tenants">
      <MyPaymentDetailContent id={id} />
    </RequireRole>
  );
}

function MyPaymentDetailContent({ id }: { id: string }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });
  const [refreshing, setRefreshing] = React.useState(false);
  const busyRef = React.useRef(false);

  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setState({ phase: 'loading' });
      try {
        const payment = await getMyPayment(id);
        setState({ phase: 'ready', payment });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          setState({ phase: 'not-found' });
          return;
        }
        setState({ phase: 'error', message: paymentErrorMessage(err, 'detail') });
      }
    },
    [id],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  // Explicit, user-initiated status refresh (no aggressive polling).
  async function refresh() {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      busyRef.current = false;
      setRefreshing(false);
    }
  }

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[{ label: 'Payments', href: '/payments' }, { label: 'Payment details' }]}
        />

        <div className="mt-6">
          {state.phase === 'loading' && <PaymentDetailSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'not-found' && (
            <EmptyState
              title="Payment not found"
              description="This payment doesn’t exist or is no longer available to you."
              action={
                <Button asChild>
                  <Link href="/payments">Back to payments</Link>
                </Button>
              }
            />
          )}

          {state.phase === 'ready' && (
            <PaymentReady payment={state.payment} refreshing={refreshing} onRefresh={refresh} />
          )}
        </div>
      </Section>
    </PageContainer>
  );
}

function PaymentReady({
  payment,
  refreshing,
  onRefresh,
}: {
  payment: TenantPayment;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const isPending = payment.status === 'PENDING';
  const isSuccess = payment.status === 'SUCCESSFUL';
  const canRetry =
    payment.status === 'FAILED' || payment.status === 'CANCELLED' || payment.status === 'EXPIRED';

  return (
    <div className="space-y-6">
      <PaymentPropertySummaryBlock property={payment.property} />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-h4">Payment status</CardTitle>
          <PaymentStatusBadge status={payment.status} />
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status headline: icon + text, never color alone. */}
          <p
            className="flex items-center gap-2 text-sm font-medium text-foreground"
            aria-live="polite"
          >
            {isSuccess ? (
              <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            ) : isPending ? (
              <Clock className="size-5 text-foreground" aria-hidden="true" />
            ) : null}
            {PAYMENT_STATUS_TEXT[payment.status]}
          </p>

          {isPending && (
            <p className="text-sm text-muted-foreground">
              Approve the MTN Mobile Money prompt on your phone. Confirmation isn’t instant — use
              Refresh to check the latest status.
            </p>
          )}

          <PaymentFacts
            amount={payment.amount}
            currency={payment.currency}
            paymentPeriod={payment.paymentPeriod}
            provider={payment.provider}
            createdAt={payment.createdAt}
            completedAt={payment.completedAt}
            reference={payment.providerTransactionId}
          />

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {isPending && (
              <Button variant="outline" onClick={onRefresh} loading={refreshing}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Refresh status
              </Button>
            )}
            {canRetry && (
              <Button asChild>
                <Link href={`/rentals/${payment.rentalId}/pay`}>Try again</Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/payments">All payments</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
