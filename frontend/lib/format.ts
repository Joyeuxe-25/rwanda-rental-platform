/**
 * Formatting helpers. Money is an INTEGER number of whole units (RWF by
 * default) — never floating point. Thousands separators via `Intl.NumberFormat`.
 */

/** Format an integer amount as e.g. `RWF 300,000`. */
export function formatMoney(amount: number, currency = 'RWF'): string {
  const safe = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  return `${currency} ${new Intl.NumberFormat('en-US').format(safe)}`;
}

/** Monthly rent label, e.g. `RWF 300,000 / month`. */
export function formatMonthlyRent(amount: number, currency = 'RWF'): string {
  return `${formatMoney(amount, currency)} / month`;
}

/**
 * Format an ISO timestamp as a readable date, e.g. `19 Aug 2026`. Returns an
 * em dash for a missing/invalid value rather than throwing.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Format an ISO timestamp as a relative time for recent events ("just now",
 * "5 min ago", "3 hr ago", "2 days ago") and fall back to an absolute date for
 * anything older than ~a week. Returns an em dash for a missing/invalid value.
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  return formatDate(iso);
}

/**
 * Format a `YYYY-MM` payment period as e.g. `August 2026`. Returns the raw value
 * for anything that doesn't match, rather than throwing.
 */
export function formatPaymentPeriod(period: string | null | undefined): string {
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period ?? '—';
  const [y, m] = period.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d);
}
