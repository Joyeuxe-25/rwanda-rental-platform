/**
 * Thin Cloudflare R2 wrapper (B5). Keeps R2 calls out of repositories; the
 * service layer uses these helpers. `bucket` is the `ASSETS` binding.
 */

export async function putObject(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await bucket.put(key, data, { httpMetadata: { contentType } });
}

export async function getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

/** R2 delete is idempotent (no error if the key is absent). */
export async function deleteObject(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}
