'use client';

import * as React from 'react';
import Link from 'next/link';
import { UserRound } from 'lucide-react';

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
import { getLandlordPayment } from '@/lib/payments';
import type { LandlordPayment } from '@/types/payment';

type State =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; payment: LandlordPayment };

/** Landlord payment detail (F6). Landlord-only; read-only — NO mutation controls
 * (a landlord can never change a payment's status). */
export function LandlordPaymentDetailView({ id }: { id: string }) {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Payments are available to landlords">
      <LandlordPaymentDetailContent id={id} />
    </RequireRole>
  );
}

function LandlordPaymentDetailContent({ id }: { id: string }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const payment = await getLandlordPayment(id);
      setState({ phase: 'ready', payment });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setState({ phase: 'not-found' });
        return;
      }
      setState({ phase: 'error', message: paymentErrorMessage(err, 'detail') });
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <Breadcrumb
          items={[{ label: 'Payments', href: '/landlord/payments' }, { label: 'Payment details' }]}
        />

        <div className="mt-6">
          {state.phase === 'loading' && <PaymentDetailSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'not-found' && (
            <EmptyState
              title="Payment not found"
              description="This payment doesn’t exist or isn’t for one of your properties."
              action={
                <Button asChild>
                  <Link href="/landlord/payments">Back to payments</Link>
                </Button>
              }
            />
          )}

          {state.phase === 'ready' && (
            <div className="space-y-6">
              <PaymentPropertySummaryBlock property={state.payment.property} />

              <Card>
                <CardHeader>
                  <CardTitle className="text-h4">Tenant</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                    {state.payment.tenant.firstName} {state.payment.tenant.lastName}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-h4">Payment status</CardTitle>
                  <PaymentStatusBadge status={state.payment.status} />
                </CardHeader>
                <CardContent className="space-y-6">
                  <p className="text-sm font-medium text-foreground">
                    {PAYMENT_STATUS_TEXT[state.payment.status]}
                  </p>
                  <PaymentFacts
                    amount={state.payment.amount}
                    currency={state.payment.currency}
                    paymentPeriod={state.payment.paymentPeriod}
                    provider={state.payment.provider}
                    createdAt={state.payment.createdAt}
                    completedAt={state.payment.completedAt}
                    reference={state.payment.providerTransactionId}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </Section>
    </PageContainer>
  );
}
