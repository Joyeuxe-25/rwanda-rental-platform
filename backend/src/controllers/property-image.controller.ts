import type { Context } from 'hono';

import { getDb } from '../db/client';
import { getAuthUser } from '../middleware/auth';
import * as imageService from '../services/property-image.service';
import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import type { ReorderImagesInput } from '../validators/property-image.validators';

/**
 * Property-image controllers (B5). Thin HTTP layer: landlord id always from the
 * session; property/image ids from route params (validated by the service).
 */

function param(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name);
  if (!value) throw ApiError.notFound('Not found', 'NOT_FOUND');
  return value;
}

/** POST /api/v1/properties/mine/:id/images (multipart) */
export async function upload(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const propertyId = param(c, 'id');

  let file: imageService.UploadFile | null = null;
  const form = await c.req.formData().catch(() => null);
  const entry = form?.get('file');
  if (entry && typeof entry !== 'string') {
    file = {
      bytes: await entry.arrayBuffer(),
      size: entry.size,
      filename: entry.name,
    };
  }

  const image = await imageService.uploadImage(getDb(c.env), c.env, landlordId, propertyId, file);
  return sendSuccess(c, { image }, 201);
}

/** GET /api/v1/properties/mine/:id/images */
export async function list(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const images = await imageService.listImages(getDb(c.env), landlordId, param(c, 'id'));
  return sendSuccess(c, { images });
}

/** PATCH /api/v1/properties/mine/:propertyId/images/:imageId/primary */
export async function setPrimary(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const images = await imageService.setPrimaryImage(
    getDb(c.env),
    landlordId,
    param(c, 'propertyId'),
    param(c, 'imageId'),
  );
  return sendSuccess(c, { images });
}

/** PATCH /api/v1/properties/mine/:propertyId/images/reorder */
export async function reorder(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const input = c.get('validatedBody') as ReorderImagesInput;
  const images = await imageService.reorderImages(
    getDb(c.env),
    landlordId,
    param(c, 'propertyId'),
    input,
  );
  return sendSuccess(c, { images });
}

/** DELETE /api/v1/properties/mine/:propertyId/images/:imageId */
export async function remove(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  await imageService.deleteImage(
    getDb(c.env),
    c.env,
    landlordId,
    param(c, 'propertyId'),
    param(c, 'imageId'),
  );
  return sendSuccess(c, { message: 'Image deleted' });
}

/** GET /api/v1/properties/:propertyId/images/:imageId (public bytes) */
export async function getPublic(c: Context<AppEnv>) {
  const { bytes, contentType } = await imageService.getPublicImageBytes(
    getDb(c.env),
    c.env,
    param(c, 'propertyId'),
    param(c, 'imageId'),
  );
  return c.body(bytes, 200, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600',
  });
}
