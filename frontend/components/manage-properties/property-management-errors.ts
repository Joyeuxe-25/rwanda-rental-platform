import { ApiRequestError } from '@/lib/api';

/**
 * Map a backend property/image management error (B4/B5) to SAFE, user-facing
 * copy (F11). Raw backend messages, codes, SQL, and stack traces are never
 * surfaced. Codes verified against the backend services.
 */

/** Errors from creating/updating/publishing/deleting a property. */
export function propertyErrorMessage(err: unknown): string {
  const generic = 'We couldn’t complete that. Please try again.';
  if (!(err instanceof ApiRequestError)) return generic;

  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.status === 401) return 'Your session has expired. Please sign in again.';
  if (err.status === 403) return 'You do not have permission to manage this property.';
  if (err.code === 'PROPERTY_NOT_FOUND' || err.status === 404)
    return 'This property could not be found. It may have been removed.';
  if (err.code === 'PROPERTY_CANNOT_BE_DELETED')
    return 'This property can’t be deleted because it has related rental records.';
  if (err.code === 'PROPERTY_INCOMPLETE')
    return 'Add a description and the required listing details before publishing.';
  if (err.status === 422) return 'Please check the highlighted fields and try again.';
  return generic;
}

/** Errors from uploading/reordering/deleting/setting a primary image. */
export function imageErrorMessage(err: unknown): string {
  const generic = 'We couldn’t update your images. Please try again.';
  if (!(err instanceof ApiRequestError)) return generic;

  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.status === 401) return 'Your session has expired. Please sign in again.';
  if (err.status === 403) return 'You do not have permission to manage these images.';
  if (err.code === 'IMAGE_FILE_REQUIRED') return 'Please choose an image file to upload.';
  if (err.code === 'IMAGE_TYPE_NOT_ALLOWED')
    return 'Unsupported image type. Use a JPEG, PNG, or WebP image.';
  if (err.code === 'IMAGE_TOO_LARGE') return 'That image is too large. The maximum size is 5 MB.';
  if (err.code === 'IMAGE_LIMIT_REACHED')
    return 'This property already has the maximum of 20 images.';
  if (err.code === 'IMAGE_NOT_FOUND')
    return 'That image could not be found. It may already be removed.';
  if (err.code === 'INVALID_IMAGE_ORDER') return 'The image order was invalid. Please try again.';
  if (err.code === 'IMAGE_UPLOAD_FAILED') return 'The upload failed. Please try again.';
  if (err.code === 'PROPERTY_NOT_FOUND' || err.status === 404)
    return 'This property could not be found. It may have been removed.';
  return generic;
}
