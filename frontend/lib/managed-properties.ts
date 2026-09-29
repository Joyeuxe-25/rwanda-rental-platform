/**
 * Landlord property-management data access (F11).
 *
 * A thin domain layer over the single shared `api` client (lib/api.ts) — there
 * is NO second HTTP wrapper. Every call rides the HttpOnly `rrp_session` cookie
 * via `credentials: 'include'`; there is no token storage and no external
 * provider call. Reads are `no-store` so a landlord never sees stale or
 * cross-user cached management data.
 *
 * The write helpers send ONLY the editable B4 fields. Server-controlled fields
 * (id, landlordId, status, isPublished, publishedAt, currency, timestamps) and
 * image-record fields (storageKey/objectKey, isPrimary, sortOrder, createdAt)
 * are never placed in a request body. IDs travel in the URL, never the body.
 */
import { api, ApiRequestError } from './api';
import type {
  ManagedImage,
  ManagedProperty,
  PropertyInput,
  PropertyUpdateInput,
} from '@/types/managed-property';
import type { ApiResponse } from '@/types/api';

const NO_STORE = { cache: 'no-store' as const };

/* ------------------------------- Properties ------------------------------- */

/** GET /properties/mine — the landlord's own properties (published + drafts). */
export async function listMyProperties(): Promise<ManagedProperty[]> {
  const { properties } = await api.get<{ properties: ManagedProperty[] }>(
    '/properties/mine',
    NO_STORE,
  );
  return properties;
}

/** GET /properties/mine/:id — a single owned property (404 if not owned). */
export async function getMyProperty(id: string): Promise<ManagedProperty> {
  const { property } = await api.get<{ property: ManagedProperty }>(
    `/properties/mine/${encodeURIComponent(id)}`,
    NO_STORE,
  );
  return property;
}

/** POST /properties — create a draft (landlord-only; starts unpublished, AVAILABLE). */
export async function createProperty(input: PropertyInput): Promise<ManagedProperty> {
  const { property } = await api.post<{ property: ManagedProperty }>('/properties', input);
  return property;
}

/** PATCH /properties/mine/:id — send only the changed editable fields. */
export async function updateMyProperty(
  id: string,
  input: PropertyUpdateInput,
): Promise<ManagedProperty> {
  const { property } = await api.patch<{ property: ManagedProperty }>(
    `/properties/mine/${encodeURIComponent(id)}`,
    input,
  );
  return property;
}

/** DELETE /properties/mine/:id — may fail with PROPERTY_CANNOT_BE_DELETED. */
export async function deleteMyProperty(id: string): Promise<void> {
  await api.del(`/properties/mine/${encodeURIComponent(id)}`);
}

/** PATCH /properties/mine/:id/publish — landlord-controlled publication. */
export async function publishMyProperty(id: string): Promise<ManagedProperty> {
  const { property } = await api.patch<{ property: ManagedProperty }>(
    `/properties/mine/${encodeURIComponent(id)}/publish`,
  );
  return property;
}

/** PATCH /properties/mine/:id/unpublish — remove from the public marketplace. */
export async function unpublishMyProperty(id: string): Promise<ManagedProperty> {
  const { property } = await api.patch<{ property: ManagedProperty }>(
    `/properties/mine/${encodeURIComponent(id)}/unpublish`,
  );
  return property;
}

/* --------------------------------- Images --------------------------------- */

/** GET /properties/mine/:id/images — gallery for management. */
export async function listPropertyImages(propertyId: string): Promise<ManagedImage[]> {
  const { images } = await api.get<{ images: ManagedImage[] }>(
    `/properties/mine/${encodeURIComponent(propertyId)}/images`,
    NO_STORE,
  );
  return images;
}

/**
 * POST /properties/mine/:id/images — multipart upload.
 *
 * The image bytes are sent as multipart/form-data under the field name `file`
 * (the ONLY field the backend reads). We deliberately use `api.raw` so the
 * browser sets the multipart boundary Content-Type itself; no storageKey,
 * isPrimary, or sortOrder is ever sent. The success/error envelope is parsed
 * here into the same `ApiRequestError` shape the rest of the app expects.
 */
export async function uploadPropertyImage(propertyId: string, file: File): Promise<ManagedImage> {
  const form = new FormData();
  form.append('file', file);

  let res: Response;
  try {
    res = await api.raw(`/properties/mine/${encodeURIComponent(propertyId)}/images`, {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiRequestError('Network request failed', 'NETWORK_ERROR', 0);
  }

  const payload = (await res.json().catch(() => null)) as ApiResponse<{
    image: ManagedImage;
  }> | null;

  if (!res.ok || !payload || payload.success === false) {
    const err = payload && payload.success === false ? payload.error : undefined;
    throw new ApiRequestError(
      err?.message ?? 'Upload failed',
      err?.code ?? 'REQUEST_FAILED',
      res.status,
      err?.details,
    );
  }

  return payload.data.image;
}

/** PATCH /properties/mine/:propertyId/images/:imageId/primary — returns the updated list. */
export async function setPrimaryPropertyImage(
  propertyId: string,
  imageId: string,
): Promise<ManagedImage[]> {
  const { images } = await api.patch<{ images: ManagedImage[] }>(
    `/properties/mine/${encodeURIComponent(propertyId)}/images/${encodeURIComponent(
      imageId,
    )}/primary`,
  );
  return images;
}

/**
 * PATCH /properties/mine/:propertyId/images/reorder — the body is `{ imageIds }`
 * ONLY (a full permutation of the current image ids). Returns the updated list.
 */
export async function reorderPropertyImages(
  propertyId: string,
  imageIds: string[],
): Promise<ManagedImage[]> {
  const { images } = await api.patch<{ images: ManagedImage[] }>(
    `/properties/mine/${encodeURIComponent(propertyId)}/images/reorder`,
    { imageIds },
  );
  return images;
}

/** DELETE /properties/mine/:propertyId/images/:imageId. */
export async function deletePropertyImage(propertyId: string, imageId: string): Promise<void> {
  await api.del(
    `/properties/mine/${encodeURIComponent(propertyId)}/images/${encodeURIComponent(imageId)}`,
  );
}
