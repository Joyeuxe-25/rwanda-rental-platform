import type { PaymentStatus } from '../../../types/payment';

/**
 * MTN status → internal PaymentStatus mapping (B10).
 *
 * MTN Collection request-to-pay reports exactly: PENDING | SUCCESSFUL | FAILED.
 * We map onto our vocabulary conservatively — an unknown/intermediate MTN status
 * is treated as PENDING (never invented as SUCCESSFUL).
 */
export function mapMtnStatus(mtnStatus: string): PaymentStatus {
  switch (mtnStatus.toUpperCase()) {
    case 'SUCCESSFUL':
      return 'SUCCESSFUL';
    case 'FAILED':
      return 'FAILED';
    case 'PENDING':
    default:
      return 'PENDING';
  }
}

/**
 * Convert our stored E.164 phone (`+2507XXXXXXXX`) to the MSISDN format MTN
 * expects (international digits, NO leading '+'), e.g. `2507XXXXXXXX`.
 */
export function toMsisdn(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}
