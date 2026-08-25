/**
 * Opaque token generation/hashing for sessions and password resets.
 *
 * A token is 32 cryptographically-random bytes (`crypto.getRandomValues`),
 * base64url-encoded, and returned to the client (session cookie / reset link).
 * Only its SHA-256 hash (`crypto.subtle.digest`) is stored in D1, so a DB leak
 * never exposes a usable token. NEVER log the raw token.
 */
const TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 hash of a token (hex), used as the DB lookup key. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

/** Generate a new random token and its hash. Return the raw token to the client only. */
export async function generateToken(): Promise<{ token: string; tokenHash: string }> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const tokenHash = await hashToken(token);
  return { token, tokenHash };
}
