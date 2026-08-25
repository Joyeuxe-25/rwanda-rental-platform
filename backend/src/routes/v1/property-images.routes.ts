import { Hono } from 'hono';

import * as imageController from '../../controllers/property-image.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import type { AppEnv } from '../../types';
import { validate } from '../../validators/validate';
import { reorderImagesSchema } from '../../validators/property-image.validators';

/**
 * Property-image routes (B5), mounted under /api/v1/properties.
 *
 * Management routes require auth + LANDLORD (ownership enforced in the service).
 * The public bytes route needs no auth and only serves images of PUBLISHED
 * properties. `/reorder` is declared before `/:imageId` so the static segment
 * wins over the param.
 */
const images = new Hono<AppEnv>();
const landlordOnly = [requireAuth, requireRole('LANDLORD')] as const;

// Landlord management
images.post('/mine/:id/images', ...landlordOnly, imageController.upload);
images.get('/mine/:id/images', ...landlordOnly, imageController.list);
images.patch(
  '/mine/:propertyId/images/reorder',
  ...landlordOnly,
  validate({ json: reorderImagesSchema }),
  imageController.reorder,
);
images.patch(
  '/mine/:propertyId/images/:imageId/primary',
  ...landlordOnly,
  imageController.setPrimary,
);
images.delete('/mine/:propertyId/images/:imageId', ...landlordOnly, imageController.remove);

// Public image bytes (published properties only)
images.get('/:propertyId/images/:imageId', imageController.getPublic);

export default images;
