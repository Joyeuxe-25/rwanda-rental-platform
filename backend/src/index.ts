import { createApp } from './app';

/**
 * Cloudflare Worker entry point.
 *
 * Exporting the Hono app as the default export makes its `fetch` handler the
 * Worker's request handler. Process/lifecycle concerns from the previous
 * Node/Express architecture (manual server startup, graceful shutdown) are not
 * applicable on Workers — the runtime manages the request lifecycle.
 */
const app = createApp();

export default app;
