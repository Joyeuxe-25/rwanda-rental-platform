import { Hono } from 'hono';

import * as controller from '../../controllers/rental-request.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import type { AppEnv } from '../../types';
import { validate } from '../../validators/validate';
import { createRentalRequestSchema } from '../../validators/rental-request.validators';

/**
 * Rental-request routes (B6), mounted at /api/v1/rental-requests.
 *
 * Tenant routes (`/`, `/mine*`) require TENANT; landlord routes (`/landlord*`)
 * require LANDLORD. All resources are private — there is no public/unauthed
 * rental-request route. Ownership is enforced in the service via the session id.
 */
const rentalRequests = new Hono<AppEnv>();

const tenantOnly = [requireAuth, requireRole('TENANT')] as const;
const landlordOnly = [requireAuth, requireRole('LANDLORD')] as const;

// Tenant
rentalRequests.post(
  '/',
  ...tenantOnly,
  validate({ json: createRentalRequestSchema }),
  controller.create,
);
rentalRequests.get('/mine', ...tenantOnly, controller.listMine);
rentalRequests.get('/mine/:id', ...tenantOnly, controller.getMine);
rentalRequests.patch('/mine/:id/cancel', ...tenantOnly, controller.cancelMine);

// Landlord
rentalRequests.get('/landlord', ...landlordOnly, controller.listLandlord);
rentalRequests.get('/landlord/:id', ...landlordOnly, controller.getLandlord);
rentalRequests.patch('/landlord/:id/approve', ...landlordOnly, controller.approve);
rentalRequests.patch('/landlord/:id/reject', ...landlordOnly, controller.reject);

export default rentalRequests;
