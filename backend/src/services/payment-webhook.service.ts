import type { Database } from '../db/client';
import { hashToken } from '../lib/crypto/tokens';
import { logger } from '../lib/logger';
import * as paymentRepo from '../repositories/payment.repository';
import * as eventRepo from '../repositories/payment-webhook.repository';
import { ApiError } from '../utils/ApiError';
import * as paymentService from './payment.service';
import { getWebhookAdapter } from './payment-providers/registry';
import type {
  NormalizedWebhookEvent,
  PaymentProviderName,
  WebhookVerificationContext,
} from '../types/payment';
import { normalizedWebhookEventSchema } from '../validators/payment-webhook.validators';

/**
 * Payment webhook service (B9) — the central security/business boundary for
 * future provider callbacks. It is provider-NEUTRAL: it never calls a provider
 * and never contains MTN/Airtel logic. The provider-specific `verify`/`normalize`
 * come from a registered adapter (B10/B11); B9 orchestrates the pipeline.
 *
 * Pipeline (strictly ordered — payment state is NEVER touched before auth):
 *   verify (auth) → normalize → validate → dedup → persist(RECEIVED) →
 *   correlate → verify amount/currency → apply B8 transition → mark outcome.
 *
 * Payment transitions go through the SINGLE authoritative B8 mechanism
 * (`paymentService.applyProviderStatus`) — there is no second state machine.
 */

export interface WebhookOutcome {
  received: true;
  /** true only when an event was already handled (idempotent duplicate). */
  duplicate?: boolean;
  matched?: boolean;
}

/** SHA-256 fingerprint of the raw body — for replay/dedup only (not auth). */
async function payloadHash(rawBody: string): Promise<string> {
  return hashToken(rawBody);
}

function assertValidNormalized(event: NormalizedWebhookEvent, provider: PaymentProviderName): void {
  const parsed = normalizedWebhookEventSchema.safeParse(event);
  if (!parsed.success || parsed.data.provider !== provider) {
    throw new ApiError(400, 'Invalid webhook event', 'WEBHOOK_INVALID_EVENT');
  }
}

export async function processWebhook(
  db: Database,
  ctx: WebhookVerificationContext,
): Promise<WebhookOutcome> {
  const { provider } = ctx;

  // 1) Provider adapter (501 if not implemented — MTN/Airtel land in B10/B11).
  const adapter = getWebhookAdapter(provider);

  // 2) Authenticate the delivery BEFORE anything else touches state.
  let verified = false;
  try {
    verified = await adapter.verify(ctx);
  } catch {
    verified = false;
  }
  if (!verified) {
    // Not persisted — avoids a DB-flooding vector from forged deliveries.
    throw new ApiError(401, 'Webhook verification failed', 'WEBHOOK_VERIFICATION_FAILED');
  }

  // 3) Normalize the opaque payload (adapter maps provider status → internal).
  let event: NormalizedWebhookEvent;
  try {
    event = adapter.normalize(ctx);
  } catch {
    throw new ApiError(400, 'Malformed webhook payload', 'WEBHOOK_INVALID_EVENT');
  }
  assertValidNormalized(event, provider);

  // 4) Dedup: a re-delivered event is acknowledged without reprocessing.
  const hash = await payloadHash(ctx.rawBody);
  const dup = await eventRepo.findDuplicate(db, provider, event.externalEventId, hash);
  if (dup) {
    logger.info('webhook.duplicate', { provider, eventId: dup.id, status: dup.processingStatus });
    return { received: true, duplicate: true };
  }

  // 5) Persist the authenticated event (RECEIVED). The unique indexes are the
  //    race-safe backstop for concurrent duplicate deliveries.
  let eventId: string;
  try {
    const row = await eventRepo.insertEvent(db, {
      provider,
      externalEventId: event.externalEventId,
      externalTransactionId: event.externalTransactionId,
      eventStatus: event.status,
      payloadHash: hash,
      processingStatus: 'RECEIVED',
    });
    eventId = row.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/UNIQUE constraint/i.test(message)) {
      logger.info('webhook.duplicate_race', { provider });
      return { received: true, duplicate: true };
    }
    throw err;
  }

  // 6) Correlate to an internal payment by (provider, providerTransactionId)
  //    ONLY — never by amount/phone/name.
  if (!event.externalTransactionId) {
    await eventRepo.markUnmatched(db, eventId);
    logger.info('webhook.unmatched', { provider, eventId });
    return { received: true, matched: false };
  }
  const payment = await paymentRepo.findByProviderAndTxn(db, provider, event.externalTransactionId);
  if (!payment) {
    await eventRepo.markUnmatched(db, eventId);
    logger.info('webhook.unmatched', { provider, eventId });
    return { received: true, matched: false };
  }

  // 7) Verify amount/currency before applying success — never trust blindly.
  if (event.amount !== null && event.amount !== payment.amount) {
    await eventRepo.markFailed(db, eventId, 'PAYMENT_AMOUNT_MISMATCH', payment.id);
    logger.warn('webhook.amount_mismatch', { provider, eventId, paymentId: payment.id });
    return { received: true, matched: true };
  }
  if (event.currency !== null && event.currency !== payment.currency) {
    await eventRepo.markFailed(db, eventId, 'PAYMENT_CURRENCY_MISMATCH', payment.id);
    logger.warn('webhook.currency_mismatch', { provider, eventId, paymentId: payment.id });
    return { received: true, matched: true };
  }

  // 8) Apply the payment transition through the ONE authoritative B8 mechanism.
  try {
    await paymentService.applyProviderStatus(db, payment.id, event.status);
    await eventRepo.markProcessed(db, eventId, payment.id);
    logger.info('webhook.processed', {
      provider,
      eventId,
      paymentId: payment.id,
      status: event.status,
    });
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.code === 'PAYMENT_ALREADY_COMPLETED' || err.code === 'PAYMENT_INVALID_STATE')
    ) {
      // Terminal-state conflict: record it, never silently overwrite.
      await eventRepo.markFailed(db, eventId, 'PAYMENT_PROVIDER_STATUS_CONFLICT', payment.id);
      logger.warn('webhook.status_conflict', { provider, eventId, paymentId: payment.id });
      return { received: true, matched: true };
    }
    await eventRepo.markFailed(db, eventId, 'WEBHOOK_PROCESSING_FAILED', payment.id);
    throw err;
  }

  return { received: true, matched: true };
}
