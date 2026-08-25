/**
 * Image constants and helpers (B5).
 *
 * MIME type is determined from the file's MAGIC BYTES, never from the
 * client-supplied header/extension. Object keys are always server-generated
 * from a server-owned propertyId + a fresh imageId + a sanitized filename, so a
 * client can never choose an arbitrary R2 key or perform path traversal.
 */

/** Allowed image types → canonical file extension. SVG is intentionally excluded. */
export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AllowedMime = keyof typeof ALLOWED_IMAGE_TYPES;

/** Max size per image: 5 MB — generous for photos, bounded to protect the Worker. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Max images per property. */
export const MAX_IMAGES_PER_PROPERTY = 20;

/**
 * Detect the image type from magic bytes. Returns the canonical MIME string or
 * null if the bytes are not a supported image.
 */
export function sniffImageMime(bytes: Uint8Array): AllowedMime | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Produce a safe filename: strip any path, lowercase, keep only
 * [a-z0-9._-], collapse repeats, bound length, and force the correct extension
 * for the detected MIME. Never contains `/` or `..`.
 */
export function sanitizeFilename(name: string | undefined, ext: string): string {
  const base = (name ?? '').split(/[/\\]/).pop() ?? '';
  let cleaned = base
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '') // drop existing extension
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  if (!cleaned) cleaned = 'image';
  return `${cleaned}.${ext}`;
}

/** Server-generated R2 object key. propertyId + imageId are server-owned. */
export function buildObjectKey(propertyId: string, imageId: string, filename: string): string {
  return `properties/${propertyId}/${imageId}/${filename}`;
}

/** Public, relative URL for an image (frontend prepends the API origin). */
export function buildImageUrl(propertyId: string, imageId: string): string {
  return `/api/v1/properties/${propertyId}/images/${imageId}`;
}
