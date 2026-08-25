/**
 * Lightweight logger for Cloudflare Workers.
 *
 * Pino is intentionally NOT used: on Workers the idiomatic sink is `console`,
 * whose output is captured by `wrangler tail` and the Cloudflare dashboard.
 * This wrapper adds leveled, structured (JSON) log lines and defensively
 * redacts common sensitive fields so secrets never reach the logs.
 *
 * NEVER log: passwords, tokens, authorization headers, cookies, database
 * credentials, payment secrets, or API keys.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'api_key',
  'accesstoken',
  'access_token',
];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const line = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};

export type Logger = typeof logger;
