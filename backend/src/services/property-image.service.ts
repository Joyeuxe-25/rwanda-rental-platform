import type { Database } from '../db/client';
import type { Bindings } from '../types';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES_PER_PROPERTY,
  MAX_IMAGE_BYTES,
  buildImageUrl,
  buildObjectKey,
  sanitizeFilename,
  sniffImageMime,
} from '../lib/images';
import { logger } from '../lib/logger';
import * as storage from '../lib/storage';
import * as imageRepo from '../repositories/property-image.repository';
import * as propertyRepo from '../repositories/property.repository';
import type { PropertyImage } from '../db/schema';
import { ApiError } from '../utils/ApiError';
import type { ReorderImagesInput } from '../validators/property-image.validators';

/**
 * Property-image service (B5). Coordinates ownership, R2 storage, and D1
 * metadata. Ownership is always re-verified against the authenticated landlord
 * id; the property/image ids from the route are validated against the DB, never
 * trusted for authorization. No interactive transactions (D1-compatible).
 */

/** Safe, public-facing image representation (no storage key). */
export function toSafeImage(img: PropertyImage) {
  return {
    id: img.id,
    propertyId: img.propertyId,
    url: buildImageUrl(img.propertyId, img.id),
    originalName: img.originalName,
    mimeType: img.mimeType,
    size: img.size,
    isPrimary: img.isPrimary,
    sortOrder: img.sortOrder,
    createdAt: img.createdAt.toISOString(),
  };
}

/** Minimal public image info embedded in a public property listing. */
export function toPublicImage(img: PropertyImage) {
  return {
    id: img.id,
    url: buildImageUrl(img.propertyId, img.id),
    isPrimary: img.isPrimary,
    sortOrder: img.sortOrder,
  };
}

/** 404 (generic) unless the property exists AND belongs to this landlord. */
async function requireOwnedProperty(db: Database, landlordId: string, propertyId: string) {
  const property = await propertyRepo.findByIdForLandlord(db, propertyId, landlordId);
  if (!property) {
    throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
  }
  return property;
}

async function requireOwnedImage(
  db: Database,
  landlordId: string,
  propertyId: string,
  imageId: string,
): Promise<PropertyImage> {
  await requireOwnedProperty(db, landlordId, propertyId);
  const image = await imageRepo.findByIdInProperty(db, propertyId, imageId);
  if (!image) {
    throw ApiError.notFound('Image not found', 'IMAGE_NOT_FOUND');
  }
  return image;
}

export interface UploadFile {
  bytes: ArrayBuffer;
  size: number;
  filename: string | undefined;
}

export async function uploadImage(
  db: Database,
  env: Bindings,
  landlordId: string,
  propertyId: string,
  file: UploadFile | null,
) {
  await requireOwnedProperty(db, landlordId, propertyId);

  if (!file) {
    throw new ApiError(400, 'An image file is required', 'IMAGE_FILE_REQUIRED');
  }

  const count = await imageRepo.countByProperty(db, propertyId);
  if (count >= MAX_IMAGES_PER_PROPERTY) {
    throw ApiError.conflict(
      `A property can have at most ${MAX_IMAGES_PER_PROPERTY} images`,
      'IMAGE_LIMIT_REACHED',
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'Image exceeds the maximum allowed size (5 MB)', 'IMAGE_TOO_LARGE');
  }

  const uint8 = new Uint8Array(file.bytes);
  if (uint8.byteLength > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'Image exceeds the maximum allowed size (5 MB)', 'IMAGE_TOO_LARGE');
  }

  // Trust the bytes, not the client-declared type.
  const mime = sniffImageMime(uint8);
  if (!mime) {
    throw new ApiError(
      415,
      'Only JPEG, PNG, and WebP images are allowed',
      'IMAGE_TYPE_NOT_ALLOWED',
    );
  }

  const imageId = crypto.randomUUID();
  const filename = sanitizeFilename(file.filename, ALLOWED_IMAGE_TYPES[mime]);
  const objectKey = buildObjectKey(propertyId, imageId, filename);

  // 1) Store bytes in R2.
  await storage.putObject(env.ASSETS, objectKey, file.bytes, mime);

  // 2) Persist metadata. On failure, clean up the R2 object (no orphans).
  try {
    const image = await imageRepo.insertImage(db, {
      id: imageId,
      propertyId,
      objectKey,
      originalName: filename,
      mimeType: mime,
      size: uint8.byteLength,
      isPrimary: count === 0, // first image becomes primary
      sortOrder: count,
    });
    logger.info('image.uploaded', { landlordId, propertyId, imageId, size: uint8.byteLength });
    return toSafeImage(image);
  } catch {
    try {
      await storage.deleteObject(env.ASSETS, objectKey);
    } catch {
      // best-effort cleanup
    }
    logger.error('image.upload_metadata_failed', { propertyId, imageId });
    throw new ApiError(500, 'Failed to store the image', 'IMAGE_UPLOAD_FAILED', undefined, false);
  }
}

export async function listImages(db: Database, landlordId: string, propertyId: string) {
  await requireOwnedProperty(db, landlordId, propertyId);
  const images = await imageRepo.listByProperty(db, propertyId);
  return images.map(toSafeImage);
}

export async function setPrimaryImage(
  db: Database,
  landlordId: string,
  propertyId: string,
  imageId: string,
) {
  await requireOwnedImage(db, landlordId, propertyId, imageId);
  // Clear all, then set the chosen one — idempotent and scoped to the property.
  await imageRepo.clearPrimary(db, propertyId);
  await imageRepo.setPrimary(db, propertyId, imageId, true);
  const images = await imageRepo.listByProperty(db, propertyId);
  return images.map(toSafeImage);
}

export async function reorderImages(
  db: Database,
  landlordId: string,
  propertyId: string,
  input: ReorderImagesInput,
) {
  await requireOwnedProperty(db, landlordId, propertyId);
  const existing = await imageRepo.listByProperty(db, propertyId);
  const existingIds = new Set(existing.map((i) => i.id));

  // The provided list must be an exact permutation of the property's images.
  const sameLength = input.imageIds.length === existing.length;
  const allBelong = input.imageIds.every((id) => existingIds.has(id));
  if (!sameLength || !allBelong) {
    throw new ApiError(
      422,
      'The provided image order must include exactly the property’s images',
      'INVALID_IMAGE_ORDER',
    );
  }

  for (let i = 0; i < input.imageIds.length; i++) {
    await imageRepo.setSortOrder(db, propertyId, input.imageIds[i]!, i);
  }
  const images = await imageRepo.listByProperty(db, propertyId);
  return images.map(toSafeImage);
}

export async function deleteImage(
  db: Database,
  env: Bindings,
  landlordId: string,
  propertyId: string,
  imageId: string,
) {
  const image = await requireOwnedImage(db, landlordId, propertyId, imageId);

  // Remove the R2 object first (idempotent — missing object is not an error).
  await storage.deleteObject(env.ASSETS, image.objectKey);
  // Remove the D1 metadata.
  await imageRepo.deleteById(db, propertyId, imageId);

  // If we deleted the primary and others remain, promote the first remaining.
  if (image.isPrimary) {
    const remaining = await imageRepo.listByProperty(db, propertyId);
    const next = remaining[0];
    if (next) {
      await imageRepo.setPrimary(db, propertyId, next.id, true);
    }
  }
  logger.info('image.deleted', { landlordId, propertyId, imageId });
}

/** Public listing images for a property (ordered), used by the public property view. */
export async function listPublicImages(db: Database, propertyId: string) {
  const images = await imageRepo.listByProperty(db, propertyId);
  return images.map(toPublicImage);
}

/**
 * Public image bytes: only served for a PUBLISHED property, and only when the
 * image belongs to that property and the R2 object exists — otherwise 404.
 * Returns the bytes and the content type for the controller to stream.
 */
export async function getPublicImageBytes(
  db: Database,
  env: Bindings,
  propertyId: string,
  imageId: string,
  ownerId?: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const property = ownerId
    ? await propertyRepo.findByIdForLandlord(db, propertyId, ownerId)
    : await propertyRepo.findPublishedById(db, propertyId);
  if (!property) {
    throw ApiError.notFound('Image not found', 'IMAGE_NOT_FOUND');
  }
  const image = await imageRepo.findByIdInProperty(db, propertyId, imageId);
  if (!image) {
    throw ApiError.notFound('Image not found', 'IMAGE_NOT_FOUND');
  }
  const object = await storage.getObject(env.ASSETS, image.objectKey);
  if (!object) {
    // Metadata exists but the object is missing — safe 404, no R2 internals.
    throw ApiError.notFound('Image not found', 'IMAGE_NOT_FOUND');
  }
  return {
    bytes: await object.arrayBuffer(),
    contentType: image.mimeType ?? 'application/octet-stream',
  };
}
