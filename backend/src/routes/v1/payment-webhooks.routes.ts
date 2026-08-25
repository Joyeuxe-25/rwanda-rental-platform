import { Hono } from 'hono';

import * as controller from '../../controllers/payment-webhook.controller';
import type { AppEnv } from '../../types';

/**
 * Payment webhook routes (B9), mounted at /api/v1/payment-webhooks.
 *
 * PUBLIC (no `requireAuth`) — a webhook is authenticated by provider
 * verification (inside the service), not by a user session. The `:provider`
 * segment is restricted to the known providers by the controller/validator.
 * There is NO payment-mutation endpoint here for clients; only providers can
 * drive a payment transition, and only after signature verification.
 */
const paymentWebhooks = new Hono<AppEnv>();

paymentWebhooks.post('/:provider', controller.receive);

export default paymentWebhooks;
