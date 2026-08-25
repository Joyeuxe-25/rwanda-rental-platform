import { Hono } from 'hono';

import * as propertyController from '../../controllers/property.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import type { AppEnv } from '../../types';
import { validate } from '../../validators/validate';
import {
  createPropertySchema,
  listPublicPropertiesQuerySchema,
  updatePropertySchema,
} from '../../validators/property.validators';

/**
 * Property routes (B4), mounted at /api/v1/properties.
 *
 * Management routes (`/` and `/mine/*`) require auth + LANDLORD role; ownership
 * is enforced in the service/repository via the session landlord id. The public
 * detail route (`GET /:id`) needs no auth and returns published properties only.
 *
 * `/mine` routes are declared before `/:id` so the static segment wins.
 */
const properties = new Hono<AppEnv>();

const landlordOnly = [requireAuth, requireRole('LANDLORD')] as const;

// --- Landlord management ---
properties.post(
  '/',
  ...landlordOnly,
  validate({ json: createPropertySchema }),
  propertyController.create,
);
properties.get('/mine', ...landlordOnly, propertyController.listMine);
properties.get('/mine/:id', ...landlordOnly, propertyController.getMine);
properties.patch(
  '/mine/:id',
  ...landlordOnly,
  validate({ json: updatePropertySchema }),
  propertyController.updateMine,
);
properties.delete('/mine/:id', ...landlordOnly, propertyController.deleteMine);
properties.patch('/mine/:id/publish', ...landlordOnly, propertyController.publish);
properties.patch('/mine/:id/unpublish', ...landlordOnly, propertyController.unpublish);

// --- Public ---
// Public discovery list (B17). No auth. `GET /` and `GET /:id` don't collide
// (empty vs param segment); `/mine` is declared above so it always wins.
properties.get(
  '/',
  validate({ query: listPublicPropertiesQuerySchema }),
  propertyController.listPublicProperties,
);
properties.get('/:id', propertyController.getPublic);

export default properties;
