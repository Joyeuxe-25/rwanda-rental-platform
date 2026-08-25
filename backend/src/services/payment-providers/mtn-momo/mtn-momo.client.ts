import { MTN_REQUEST_TIMEOUT_MS, type MtnConfig } from './mtn-momo.config';

/**
 * MTN MoMo Collection HTTP client (B10). The ONLY place with MTN URLs + fetch.
 * Workers-compatible: uses the global `fetch` with a bounded `AbortController`
 * timeout. Credentials/tokens are used in headers but never logged/returned.
 *
 * Endpoints (MTN Collection API — official docs):
 *   POST {base}/collection/token/                  → OAuth access token
 *   POST {base}/collection/v1_0/requesttopay       → initiate a charge (202)
 *   GET  {base}/collection/v1_0/requesttopay/{id}  → transaction status
 */

/** A safe, non-sensitive error thrown by the MTN client. */
export class MtnHttpError extends Error {
  constructor(
    public readonly kind: 'AUTH' | 'CLIENT' | 'SERVER' | 'TIMEOUT' | 'NETWORK' | 'MALFORMED',
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'MtnHttpError';
  }
}

function base64(input: string): string {
  // btoa is available in the Workers runtime and Node.
  return btoa(input);
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MTN_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new MtnHttpError('TIMEOUT', null, 'MTN request timed out');
    }
    throw new MtnHttpError('NETWORK', null, 'MTN request failed');
  } finally {
    clearTimeout(timer);
  }
}

/** Obtain a short-lived OAuth access token (Basic apiUser:apiKey). */
export async function getAccessToken(config: MtnConfig): Promise<string> {
  const res = await timedFetch(`${config.baseUrl}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64(`${config.apiUser}:${config.apiKey}`)}`,
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new MtnHttpError('AUTH', res.status, 'MTN authentication failed');
  }
  if (!res.ok) {
    throw new MtnHttpError(res.status >= 500 ? 'SERVER' : 'CLIENT', res.status, 'MTN token error');
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MtnHttpError('MALFORMED', res.status, 'MTN token response was not JSON');
  }
  const token = (body as { access_token?: unknown }).access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new MtnHttpError('MALFORMED', res.status, 'MTN token response missing access_token');
  }
  return token;
}

export interface RequestToPayParams {
  referenceId: string; // X-Reference-Id (our stable per-payment UUID)
  amount: string; // MTN expects a string amount
  currency: string;
  externalId: string; // echoed back in status/callback for correlation
  payerMsisdn: string; // international MSISDN, no leading '+'
  payerMessage?: string;
  payeeNote?: string;
}

/** Result of an initiation attempt (normalized, non-sensitive). */
export type RequestToPayOutcome = 'ACCEPTED' | 'DUPLICATE';

/** Initiate a Request-to-Pay. Returns ACCEPTED (202) or DUPLICATE (409). */
export async function requestToPay(
  config: MtnConfig,
  token: string,
  params: RequestToPayParams,
): Promise<RequestToPayOutcome> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Reference-Id': params.referenceId,
    'X-Target-Environment': config.targetEnvironment,
    'Ocp-Apim-Subscription-Key': config.subscriptionKey,
    'Content-Type': 'application/json',
  };
  if (config.callbackUrl) headers['X-Callback-Url'] = config.callbackUrl;

  const res = await timedFetch(`${config.baseUrl}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      externalId: params.externalId,
      payer: { partyIdType: 'MSISDN', partyId: params.payerMsisdn },
      payerMessage: params.payerMessage ?? 'Rwanda Rental Platform rent payment',
      payeeNote: params.payeeNote ?? 'Rent payment',
    }),
  });

  if (res.status === 202) return 'ACCEPTED';
  // Idempotent: the X-Reference-Id already exists → the charge was already
  // initiated. This is our double-charge protection on retries.
  if (res.status === 409) return 'DUPLICATE';
  if (res.status === 401 || res.status === 403) {
    throw new MtnHttpError('AUTH', res.status, 'MTN authorization failed');
  }
  throw new MtnHttpError(
    res.status >= 500 ? 'SERVER' : 'CLIENT',
    res.status,
    'MTN request-to-pay error',
  );
}

export interface MtnStatusResult {
  status: string; // 'PENDING' | 'SUCCESSFUL' | 'FAILED'
  amount: string | null;
  currency: string | null;
  externalId: string | null;
  financialTransactionId: string | null;
}

/** Look up a transaction's authoritative status by reference id. */
export async function getRequestToPayStatus(
  config: MtnConfig,
  token: string,
  referenceId: string,
): Promise<MtnStatusResult> {
  const res = await timedFetch(`${config.baseUrl}/collection/v1_0/requesttopay/${referenceId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': config.targetEnvironment,
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
    },
  });
  if (res.status === 404) throw new MtnHttpError('CLIENT', 404, 'MTN transaction not found');
  if (res.status === 401 || res.status === 403) {
    throw new MtnHttpError('AUTH', res.status, 'MTN authorization failed');
  }
  if (!res.ok) {
    throw new MtnHttpError(res.status >= 500 ? 'SERVER' : 'CLIENT', res.status, 'MTN status error');
  }
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new MtnHttpError('MALFORMED', res.status, 'MTN status response was not JSON');
  }
  const status = body.status;
  if (typeof status !== 'string') {
    throw new MtnHttpError('MALFORMED', res.status, 'MTN status response missing status');
  }
  return {
    status,
    amount: typeof body.amount === 'string' ? body.amount : null,
    currency: typeof body.currency === 'string' ? body.currency : null,
    externalId: typeof body.externalId === 'string' ? body.externalId : null,
    financialTransactionId:
      typeof body.financialTransactionId === 'string' ? body.financialTransactionId : null,
  };
}
