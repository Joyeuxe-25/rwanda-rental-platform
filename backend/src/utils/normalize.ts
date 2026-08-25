/**
 * Shared normalization helpers used consistently across auth flows so that a
 * value written at registration matches the value looked up at login/reset.
 */

/** Normalize an email: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalize a Rwandan phone number to E.164 (`+2507XXXXXXXX`).
 *
 * Convention (documented for B2): strip spaces/dashes/parentheses, then:
 *   - `+2507XXXXXXXX`  → kept as-is
 *   - `2507XXXXXXXX`   → prefixed with `+`
 *   - `07XXXXXXXX`     → `+250` replaces the leading `0`
 *   - `7XXXXXXXX`      → prefixed with `+250`
 * Anything else is returned trimmed (validation rejects malformed input
 * upstream). This keeps the UNIQUE phone constraint collision-safe.
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s()-]/g, '');
  if (/^\+2507\d{8}$/.test(cleaned)) return cleaned;
  if (/^2507\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^07\d{8}$/.test(cleaned)) return `+250${cleaned.slice(1)}`;
  if (/^7\d{8}$/.test(cleaned)) return `+250${cleaned}`;
  return cleaned;
}
