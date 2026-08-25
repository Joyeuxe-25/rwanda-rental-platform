'use client';

import * as React from 'react';
import Link from 'next/link';
import { Smartphone, Clock, AlertTriangle } from 'lucide-react';

import { classifyCreateError } from '@/components/payments/payment-errors';
import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import { FormError } from '@/components/auth/auth-form-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { createPayment } from '@/lib/payments';
import { formatMoney, formatPaymentPeriod } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PaymentProviderName, TenantPayment } from '@/types/payment';

const PROVIDERS: {
  value: PaymentProviderName;
  label: string;
  hint: string;
  available: boolean;
}[] = [
  {
    value: 'MTN_MOMO',
    label: 'MTN Mobile Money',
    hint: 'Approve the prompt on your phone.',
    available: true,
  },
  { value: 'AIRTEL_MONEY', label: 'Airtel Money', hint: 'Coming soon.', available: false },
];

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Payment form (F6). Creates a PENDING payment intent for an ACTIVE rental via
 * `POST /payments` with ONLY `{ rentalId, amount, paymentPeriod, provider }` plus
 * an `Idempotency-Key` HEADER — never money/status/identity, never a payer phone
 * (the backend uses the tenant's stored number). It NEVER claims success: a 201
 * yields PENDING. A provider timeout is handled as UNCERTAIN (check status, no
 * auto-retry). The idempotency key is stable per set of parameters, so a retry of
 * the same submission reuses it (no double charge); changing a field mints a new
 * key.
 */
export function PaymentForm({
  rentalId,
  propertyTitle,
  monthlyRent,
  currency,
  payerPhone,
}: {
  rentalId: string;
  propertyTitle: string;
  monthlyRent: number;
  currency: string;
  payerPhone: string;
}) {
  const [amount, setAmount] = React.useState(String(monthlyRent));
  const [period, setPeriod] = React.useState(currentPeriod());
  const [provider, setProvider] = React.useState<PaymentProviderName>('MTN_MOMO');
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [uncertain, setUncertain] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<TenantPayment | null>(null);
  const busyRef = React.useRef(false);
  // Stable idempotency key per parameter-set. Reused on retry of the SAME params
  // (idempotent replay); a changed field mints a new key (a new intent).
  const idemRef = React.useRef<{ sig: string; key: string } | null>(null);

  const amountNum = Number(amount);
  const amountValid =
    amount.trim() !== '' &&
    Number.isInteger(amountNum) &&
    amountNum > 0 &&
    amountNum <= monthlyRent;
  const periodValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(period);

  function keyFor(): string {
    const sig = `${rentalId}|${amountNum}|${period}|${provider}`;
    if (!idemRef.current || idemRef.current.sig !== sig) {
      idemRef.current = { sig, key: crypto.randomUUID() };
    }
    return idemRef.current.key;
  }

  function validate(): boolean {
    if (!amountValid) {
      setFieldError(
        `Enter a whole amount between ${formatMoney(1, currency)} and ${formatMoney(monthlyRent, currency)}.`,
      );
      return false;
    }
    if (!periodValid) {
      setFieldError('Choose a valid payment month.');
      return false;
    }
    setFieldError(null);
    return true;
  }

  async function onConfirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    setUncertain(false);
    try {
      const payment = await createPayment(
        { rentalId, amount: amountNum, paymentPeriod: period, provider },
        keyFor(),
      );
      setOpen(false);
      setResult(payment);
    } catch (err) {
      const c = classifyCreateError(err);
      setError(c.message);
      setUncertain(c.uncertain);
      setOpen(false);
      // On uncertainty we KEEP the same idempotency key so a retry reuses it.
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }

  if (result) {
    return <PaymentInitiatedCard payment={result} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Pay rent</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {uncertain ? (
            <Alert variant="warning">
              <Clock aria-hidden="true" />
              <AlertTitle>Payment not confirmed yet</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/payments">Check payment status</Link>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <FormError message={error} />
          )}

          <FormField
            id="pay-amount"
            label="Amount to pay"
            required
            error={fieldError && !amountValid ? fieldError : undefined}
            helperText={`Maximum: ${formatMoney(monthlyRent, currency)} (this month’s rent).`}
          >
            {(p) => (
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={monthlyRent}
                step={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                {...p}
              />
            )}
          </FormField>

          <FormField
            id="pay-period"
            label="Payment period"
            required
            error={fieldError && amountValid && !periodValid ? fieldError : undefined}
            helperText="The month this rent payment is for."
          >
            {(p) => (
              <Input
                type="month"
                required
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                {...p}
              />
            )}
          </FormField>

          <fieldset className="space-y-2">
            <legend className="text-label mb-1">Pay with</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {PROVIDERS.map((pr) => {
                const active = provider === pr.value;
                return (
                  <label
                    key={pr.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                      !pr.available && 'cursor-not-allowed opacity-60',
                      active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                    )}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={pr.value}
                      checked={active}
                      disabled={!pr.available}
                      onChange={() => pr.available && setProvider(pr.value)}
                      className="sr-only"
                    />
                    <Smartphone
                      className="mt-0.5 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {pr.label}
                        {!pr.available && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                            Coming soon
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">{pr.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              MTN will send the approval prompt to your registered number
              {payerPhone ? ` (${payerPhone})` : ''}. Confirmation is asynchronous — your payment
              stays pending until MTN confirms it.
            </span>
          </p>

          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (next && !validate()) return;
              setOpen(next);
            }}
          >
            <DialogTrigger asChild>
              <Button className="w-full" disabled={!amountValid || !periodValid}>
                Review payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm your payment</DialogTitle>
                <DialogDescription>
                  Review the details. MTN Mobile Money confirmation happens on your phone and is not
                  instant.
                </DialogDescription>
              </DialogHeader>
              <dl className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <Row label="Rental" value={propertyTitle} />
                <Row label="Payment period" value={formatPaymentPeriod(period)} />
                <Row label="Amount" value={formatMoney(amountNum, currency)} />
                <Row label="Provider" value="MTN Mobile Money" />
              </dl>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" disabled={submitting}>
                    Back
                  </Button>
                </DialogClose>
                <Button onClick={onConfirm} loading={submitting}>
                  Pay {formatMoney(amountNum, currency)}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** Success-of-initiation card — PENDING, never "successful". */
function PaymentInitiatedCard({ payment }: { payment: TenantPayment }) {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <span className="mb-2 flex size-12 items-center justify-center rounded-full bg-secondary/15 text-foreground">
          <Clock className="size-6" aria-hidden="true" />
        </span>
        <CardTitle className="text-h3">Payment initiated</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-center">
        <p className="text-body text-muted-foreground">
          Waiting for mobile money confirmation. Approve the MTN prompt on your phone. This payment
          stays pending until MTN confirms it — we’ll show the final status here.
        </p>
        <dl className="mx-auto max-w-sm space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-left text-sm">
          <Row label="Amount" value={formatMoney(payment.amount, payment.currency)} />
          <Row label="Payment period" value={formatPaymentPeriod(payment.paymentPeriod)} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <PaymentStatusBadge status={payment.status} />
            </dd>
          </div>
        </dl>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link href={`/payments/${payment.id}`}>View payment status</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/payments">All payments</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
