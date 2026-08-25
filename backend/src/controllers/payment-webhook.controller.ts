import type { Context } from 'hono';

import { getDb } from '../db/client';
import { ensureMtnRegistered } from '../services/payment-providers/mtn-momo';
import * as service from '../services/payment-webhook.service';
import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import { providerParamSchema } from '../validators/payment-webhook.validators';

/**
 * Payment webhook controller (B9). Captures the RAW body/headers (so a future
 * adapter can verify a signature over the exact bytes) and hands off to the
 * service. NO user authentication — a webhook is authenticated by the provider
 * verification inside the service, not by a session cookie. Returns only a
 * generic acknowledgement (never internal payment details).
 */
const SAFE_HEADERS = [
  'content-type',
  'authorization',
  'x-signature',
  'x-webhook-signature',
  'x-test-signature',
];

export async function receive(c: Context<AppEnv>) {
  // Validate the provider from the path (only the two known providers).
  const parsed = providerParamSchema.safeParse(c.req.param('provider'));
  if (!parsed.success) {
    throw new ApiError(400, 'Unsupported payment provider', 'WEBHOOK_UNSUPPORTED_PROVIDER');
  }
  const provider = parsed.data;

  // Register the MTN adapter (if configured) so its verify/normalize is used.
  ensureMtnRegistered(c.env);

  // Preserve the raw body bytes (do NOT JSON-parse-and-discard).
  const rawBody = await c.req.text();

  // Only forward a small allow-list of non-sensitive headers the adapter needs.
  const headers: Record<string, string> = {};
  for (const name of SAFE_HEADERS) {
    const value = c.req.header(name);
    if (value !== undefined) headers[name] = value;
  }

  const outcome = await service.processWebhook(getDb(c.env), {
    provider,
    rawBody,
    headers,
    url: c.req.url,
  });

  // Generic acknowledgement — a verified event (processed/unmatched/duplicate/
  // conflict) returns 200 so the provider stops retrying; the row records the
  // real outcome for reconciliation. Verification/format failures throw 4xx.
  return sendSuccess(c, { received: outcome.received });
}
