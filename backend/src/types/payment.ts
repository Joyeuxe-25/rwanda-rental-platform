/**
 * Provider-neutral payment types (B8).
 *
 * These are CONTRACTS only — B8 does not call MTN MoMo or Airtel Money and adds
 * no credentials/URLs/webhooks. Concrete `PaymentProvider` implementations are
 * added in later phases (B10 MTN, B11 Airtel); the rest of the app depends only
 * on these interfaces so provider details never leak into services/controllers.
 */

/** Supported mobile-money providers (matches the payments.provider enum). */
export type PaymentProviderName = 'MTN_MOMO' | 'AIRTEL_MONEY';

/** Payment lifecycle statuses (matches the payments.status enum). */
export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

/** Terminal payment states — cannot transition further in B8. */
export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'SUCCESSFUL',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
];

/**
 * Normalized result a provider integration will return once implemented. B8
 * defines the shape only; nothing produces it yet.
 */
export interface PaymentProviderResult {
  /** The provider's own transaction/reference id (set only by a real provider). */
  externalTransactionId: string | null;
  /** The provider result mapped onto our neutral status vocabulary. */
  status: PaymentStatus;
  /** Optional short, non-sensitive reference (never raw payloads/credentials). */
  reference?: string;
}

/**
 * The contract a concrete provider integration (B10/B11) will implement. Kept
 * intentionally small; no implementation exists in B8.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /**
   * Begin a charge for a pending payment. `reference` is our server-generated,
   * stable per-payment id (used as the provider transaction reference, so a
   * retry never double-charges). `payerPhone` is the AUTHENTICATED tenant's
   * stored number, never a client-supplied value.
   */
  initiate(input: {
    amount: number;
    currency: string;
    reference: string;
    payerPhone: string;
  }): Promise<PaymentProviderResult>;
  /** Poll/confirm a provider transaction's status. */
  checkStatus(externalTransactionId: string): Promise<PaymentProviderResult>;
}

// ---------------------------------------------------------------------------
// Webhook / callback contracts (B9)
// ---------------------------------------------------------------------------

/** Terminal statuses a webhook may report (a webhook reports an OUTCOME). */
export type TerminalPaymentStatus = Exclude<PaymentStatus, 'PENDING'>;

/**
 * Everything a provider-specific webhook adapter needs to authenticate and
 * interpret a delivery. The RAW body bytes are preserved so a future adapter can
 * verify a signature over them (parsing must not discard the original bytes).
 */
export interface WebhookVerificationContext {
  provider: PaymentProviderName;
  rawBody: string;
  headers: Record<string, string>;
  url: string;
}

/**
 * The provider-neutral event a webhook adapter produces after parsing +
 * normalizing an opaque provider payload. `status` is already mapped onto our
 * internal vocabulary by the adapter (B9 does NOT do provider-specific mapping).
 */
export interface NormalizedWebhookEvent {
  provider: PaymentProviderName;
  /** Stable provider event id, if any (used for dedup). */
  externalEventId: string | null;
  /** Provider transaction id, used to correlate to an internal payment. */
  externalTransactionId: string | null;
  /** Outcome mapped to our internal status. */
  status: TerminalPaymentStatus;
  /** Amount/currency reported by the provider (verified before applying). */
  amount: number | null;
  currency: string | null;
  /** Provider event time (ISO), if supplied. */
  eventTimestamp?: string | null;
}

/**
 * The contract each provider's webhook integration (B10/B11) will implement.
 * `verify` authenticates the delivery (signature/HMAC/shared-secret — provider
 * specific, implemented later); `normalize` maps the opaque payload onto a
 * `NormalizedWebhookEvent`. B9 ships only this interface + a registry; no
 * concrete adapter and no provider crypto exist yet.
 */
export interface PaymentWebhookAdapter {
  readonly name: PaymentProviderName;
  /** Authenticate the delivery. MUST return false (or throw) on any doubt. */
  verify(ctx: WebhookVerificationContext): Promise<boolean>;
  /** Parse + normalize the opaque payload. Throws on a malformed payload. */
  normalize(ctx: WebhookVerificationContext): NormalizedWebhookEvent;
}

/** Internal processing lifecycle of a persisted provider event. */
export type WebhookProcessingStatus = 'RECEIVED' | 'PROCESSED' | 'UNMATCHED' | 'FAILED';
