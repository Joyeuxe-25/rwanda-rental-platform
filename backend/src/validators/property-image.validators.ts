import { z } from 'zod';

/**
 * Property-image validators (B5). Only the reorder body carries client input;
 * everything else (propertyId, imageId, storageKey, isPrimary, sortOrder,
 * createdAt) is derived/generated server-side and is never accepted from the
 * client. Upload metadata comes from the multipart file, not JSON.
 */
export const reorderImagesSchema = z
  .object({
    imageIds: z
      .array(z.string().min(1))
      .min(1, 'At least one image id is required')
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Image ids must not contain duplicates',
      }),
  })
  .strict();

export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>;
