import { Hono } from 'hono';

import * as controller from '../../controllers/rental.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import type { AppEnv } from '../../types';
import { validate } from '../../validators/validate';
import { createRentalSchema } from '../../validators/rental.validators';

/**
 * Rental routes (B7), mounted at /api/v1/rentals. All private (no public route).
 *
 * Tenant: convert an ACCEPTED request into a rental, and read own rentals.
 * Landlord: read rentals for owned properties, and end (complete/terminate) an
 * active rental. Ownership is enforced in the service via the session id.
 */
const rentals = new Hono<AppEnv>();
const tenantOnly = [requireAuth, requireRole('TENANT')] as const;
const landlordOnly = [requireAuth, requireRole('LANDLORD')] as const;

// Tenant
rentals.post(
  '/from-request/:rentalRequestId',
  ...tenantOnly,
  validate({ json: createRentalSchema }),
  controller.createFromRequest,
);
rentals.get('/mine', ...tenantOnly, controller.listMine);
rentals.get('/mine/:id', ...tenantOnly, controller.getMine);

// Landlord
rentals.get('/landlord', ...landlordOnly, controller.listLandlord);
rentals.get('/landlord/:id', ...landlordOnly, controller.getLandlord);
rentals.patch('/landlord/:id/complete', ...landlordOnly, controller.complete);
rentals.patch('/landlord/:id/terminate', ...landlordOnly, controller.terminate);

export default rentals;
