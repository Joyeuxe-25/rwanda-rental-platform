/**
 * Payment view types, mapped explicitly from the approved backend B8/B10 contract
 * (`backend/openapi.json` + the payment service). The frontend sends ONLY
 * `{ rentalId, amount, paymentPeriod, provider }` plus an `Idempotency-Key`
 * header; identity (tenant/landlord/property), currency, status, and the provider
 * transaction id are all server-derived. There are NO frontend types for MTN
 * credentials, webhook signatures, or internal provider/event records.
 */

/** Backend payment lifecycle. */
export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

/** Supported mobile-money providers (matches the backend enum). */
export type PaymentProviderName = 'MTN_MOMO' | 'AIRTEL_MONEY';

/** Compact property summary embedded in every payment response (no images/money). */
export interface PaymentPropertySummary {
  id: string;
  title: string;
  propertyType: string;
  district: string;
  sector: string;
}

/** The safe display identity of the other party (name only — no contact details). */
export interface PaymentPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** Fields shared by both party views (the B8 `paymentBase`). */
interface PaymentBase {
  id: string;
  rentalId: string;
  propertyId: string;
  amount: number;
  currency: string;
  paymentPeriod: string;
  provider: PaymentProviderName;
  /** Our server-generated reference (safe to show as a receipt reference); may be null. */
  providerTransactionId: string | null;
  status: PaymentStatus;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
  property: PaymentPropertySummary;
}

/** Tenant-facing payment (sees the landlord's display identity). */
export interface TenantPayment extends PaymentBase {
  landlord: PaymentPerson;
}

/** Landlord-facing payment (sees the tenant's display identity). */
export interface LandlordPayment extends PaymentBase {
  tenant: PaymentPerson;
}

/** The ONLY fields a client sends when creating a payment (B8 strict schema). */
export interface CreatePaymentInput {
  rentalId: string;
  amount: number;
  paymentPeriod: string;
  provider: PaymentProviderName;
}

/** True once a payment has reached a terminal state. */
export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return status !== 'PENDING';
}
