'use client';

import * as React from 'react';
import Link from 'next/link';

import { RequireRole } from '@/components/auth/require-role';
import { LandlordPaymentCard } from '@/components/payments/landlord-payment-card';
import { PaymentListSkeleton } from '@/components/payments/payment-skeletons';
import { paymentErrorMessage } from '@/components/payments/payment-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { listLandlordPayments } from '@/lib/payments';
import type { LandlordPayment } from '@/types/payment';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; payments: LandlordPayment[] };

/** Payments on the landlord's own properties (F6). Landlord-only; read-only. */
export function LandlordPaymentsView() {
  return (
    <RequireRole role="LANDLORD" forbiddenTitle="Payments are available to landlords">
      <LandlordPaymentsContent />
    </RequireRole>
  );
}

function LandlordPaymentsContent() {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const payments = await listLandlordPayments();
      setState({ phase: 'ready', payments });
    } catch (err) {
      setState({ phase: 'error', message: paymentErrorMessage(err, 'list') });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer size="content">
      <Section spacing="md">
        <h1 className="text-h1">Payments</h1>

        <div className="mt-6">
          {state.phase === 'loading' && <PaymentListSkeleton />}

          {state.phase === 'error' && (
            <ErrorState description={state.message} onRetry={() => void load()} />
          )}

          {state.phase === 'ready' &&
            (state.payments.length === 0 ? (
              <EmptyState
                title="No payment records yet"
                description="When your tenants pay rent, those payments will appear here."
                action={
                  <Button asChild variant="outline">
                    <Link href="/landlord/rentals">View rentals</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {state.payments.map((payment) => (
                  <li key={payment.id}>
                    <LandlordPaymentCard payment={payment} />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Section>
    </PageContainer>
  );
}
