/**
 * Minimal in-memory R2 shim for tests. Implements the subset of the R2Bucket
 * API the application uses (`put`, `get`, `delete`, `head`) so image tests
 * exercise the real service/controller path against a realistic binding —
 * without a live Cloudflare account.
 */
export class R2TestBucket {
  private store = new Map<string, { bytes: Uint8Array; contentType?: string }>();

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ key: string; size: number }> {
    let bytes: Uint8Array;
    if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
    else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else bytes = new TextEncoder().encode(String(value));
    this.store.set(key, { bytes, contentType: options?.httpMetadata?.contentType });
    return { key, size: bytes.length };
  }

  async get(key: string): Promise<null | {
    key: string;
    size: number;
    httpEtag: string;
    httpMetadata: { contentType?: string };
    arrayBuffer: () => Promise<ArrayBuffer>;
    text: () => Promise<string>;
    body: ReadableStream | null;
  }> {
    const entry = this.store.get(key);
    if (!entry) return null;
    const { bytes } = entry;
    return {
      key,
      size: bytes.length,
      httpEtag: '"test-etag"',
      httpMetadata: { contentType: entry.contentType },
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      text: async () => new TextDecoder().decode(bytes),
      body: new Response(bytes).body,
    };
  }

  async delete(keys: string | string[]): Promise<void> {
    if (Array.isArray(keys)) keys.forEach((k) => this.store.delete(k));
    else this.store.delete(keys);
  }

  async head(key: string): Promise<null | { key: string; size: number }> {
    const entry = this.store.get(key);
    return entry ? { key, size: entry.bytes.length } : null;
  }

  // Test-only introspection.
  has(key: string): boolean {
    return this.store.has(key);
  }
  count(): number {
    return this.store.size;
  }
  keys(): string[] {
    return [...this.store.keys()];
  }
}
