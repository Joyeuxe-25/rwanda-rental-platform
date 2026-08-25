/**
 * Password hashing for Cloudflare Workers.
 *
 * Uses **PBKDF2-HMAC-SHA-256** via the Web Crypto API (`crypto.subtle`), which
 * is available in the Workers runtime. Node-only libraries (bcrypt, argon2) are
 * deliberately avoided — they require native modules unavailable on Workers.
 *
 * Stored format (self-describing, so parameters can evolve):
 *   pbkdf2$sha256$<iterations>$<saltB64url>$<hashB64url>
 *
 * NEVER log passwords or the resulting hash.
 */
const ALGO = 'PBKDF2';
const HASH = 'SHA-256';
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: ALGO },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: ALGO, salt, iterations, hash: HASH },
    keyMaterial,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Hash a plaintext password into the stored `pbkdf2$...` format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

/** Constant-time comparison of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Verify a plaintext password against a stored hash. Never throws on mismatch. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  const salt = fromBase64Url(parts[3]!);
  const expected = fromBase64Url(parts[4]!);
  const actual = await deriveBits(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
