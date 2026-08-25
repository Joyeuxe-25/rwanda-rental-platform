import { Hono } from 'hono';

import type { AppEnv } from '../types';
import v1 from './v1';

/**
 * Root API router. Aggregates versioned routers under their base paths.
 * Current base path: /api/v1
 */
const api = new Hono<AppEnv>();

api.route('/v1', v1);

export default api;
