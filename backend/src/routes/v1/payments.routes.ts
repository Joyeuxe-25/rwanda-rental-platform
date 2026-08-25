import { Hono } from 'hono';

import * as controller from '../../controllers/payment.controller';
import { requireAuth } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rateLimit';
import { requireRole } from '../../middleware/role';
import type { AppEnv } from '../../types';
import { validate } from '../../validators/validate';
import { createPaymentSchema } from '../../validators/payment.validators';

/**
 * Payment routes (B8), mounted at /api/v1/payments. All private (no public or
 * unauthenticated route). There is intentionally NO status-mutation endpoint —
 * a client can never mark a payment SUCCESSFUL; provider callbacks/webhooks are
 * later phases.
 */
const payments = new Hono<AppEnv>();
const tenantOnly = [requireAuth, requireRole('TENANT')] as const;
const landlordOnly = [requireAuth, requireRole('LANDLORD')] as const;

// Tenant. Payment creation carries a modest per-isolate rate-limit foundation
// (abuse/spam of PENDING intents); idempotency already prevents double charges.
// Production should also enforce Cloudflare edge/WAF limits. Skipped in `test`.
payments.post(
  '/',
  ...tenantOnly,
  rateLimit({ key: 'payment-create', limit: 30, windowMs: 60 * 1000 }),
  validate({ json: createPaymentSchema }),
  controller.create,
);
payments.get('/mine', ...tenantOnly, controller.listMine);
payments.get('/mine/:id', ...tenantOnly, controller.getMine);

// Landlord
payments.get('/landlord', ...landlordOnly, controller.listLandlord);
payments.get('/landlord/:id', ...landlordOnly, controller.getLandlord);

export default payments;
