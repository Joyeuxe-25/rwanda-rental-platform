import { z } from 'zod';

/**
 * Webhook validators (B9). Provider-specific RAW payloads are opaque until the
 * provider ADAPTER interprets them — so we validate the adapter's *normalized*
 * output, not the raw body. The route `:provider` param is restricted to the
 * two known providers.
 */
export const providerParamSchema = z.enum(['MTN_MOMO', 'AIRTEL_MONEY']);

/** Shape a webhook adapter must produce; a webhook reports a terminal outcome. */
export const normalizedWebhookEventSchema = z.object({
  provider: z.enum(['MTN_MOMO', 'AIRTEL_MONEY']),
  externalEventId: z.string().min(1).max(255).nullable(),
  externalTransactionId: z.string().min(1).max(255).nullable(),
  status: z.enum(['SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED']),
  amount: z.number().int().positive().nullable(),
  currency: z.string().min(1).max(8).nullable(),
  eventTimestamp: z.string().max(64).nullable().optional(),
});

export type NormalizedWebhookEventInput = z.infer<typeof normalizedWebhookEventSchema>;
