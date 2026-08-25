import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { onError, notFound } from './lib/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import api from './routes';
import type { AppEnv } from './types';

/**
 * Builds and configures the Hono application (middleware + routes) WITHOUT
 * binding it to a runtime. `index.ts` exports this app as the Worker's fetch
 * handler; tests import it and call `app.request(...)` directly. Keeping this
 * separate from the entry point keeps the app trivially testable.
 */
export function createApp() {
  const app = new Hono<AppEnv>();

  // --- Security -------------------------------------------------------------
  app.use('*', secureHeaders());

  // CORS is configurable (not permanently open). The allowed origin is an exact
  // match read from the `FRONTEND_URL` binding at request time (never a wildcard
  // and never a reflected Origin), defaulting to the local frontend dev origin.
  // A request from any other origin gets no `Access-Control-Allow-Origin`, so a
  // credentialed browser cannot read the response (CSRF/cross-site read defense
  // that complements the SameSite cookie). `Idempotency-Key` MUST be allowed —
  // cross-origin payment creation depends on it; omitting it would make the
  // browser drop the header and defeat double-charge protection.
  app.use('*', (c, next) =>
    cors({
      origin: c.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      maxAge: 86400,
    })(c, next),
  );

  // --- Request logging ------------------------------------------------------
  app.use('*', requestLogger);

  // --- Routes ---------------------------------------------------------------
  app.route('/api', api);

  // --- 404 + centralized error handling -------------------------------------
  app.notFound(notFound);
  app.onError(onError);

  return app;
}

export default createApp;
