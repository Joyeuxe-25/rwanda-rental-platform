'use client';

import * as React from 'react';
import Link from 'next/link';

import { RequireRole } from '@/components/auth/require-role';
import { PaymentListSkeleton } from '@/components/payments/payment-skeletons';
import { TenantPaymentCard } from '@/components/payments/tenant-payment-card';
import { paymentErrorMessage } from '@/components/payments/payment-errors';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { listMyPayments } from '@/lib/payments';
import type { TenantPayment } from '@/types/payment';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; payments: TenantPayment[] };

/** A tenant's payments (F6). Tenant-only; the backend returns only the
 * authenticated tenant's payments (no client-side ownership filtering). */
export function MyPaymentsView() {
  return (
    <RequireRole role="TENANT" forbiddenTitle="Payments are available to tenants">
      <MyPaymentsContent />
    </RequireRole>
  );
}

function MyPaymentsContent() {
  const [state, setState] = React.useState<State>({ phase: 'loading' });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const payments = await listMyPayments();
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
                title="No payments yet"
                description="When you pay rent on an active rental, your payments will appear here."
                action={
                  <Button asChild>
                    <Link href="/rentals">View my rentals</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {state.payments.map((payment) => (
                  <li key={payment.id}>
                    <TenantPaymentCard payment={payment} />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Section>
    </PageContainer>
  );
}
