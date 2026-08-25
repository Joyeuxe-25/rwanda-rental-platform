import { Hono } from 'hono';

import { getHealth } from '../../controllers/health.controller';
import type { AppEnv } from '../../types';

const health = new Hono<AppEnv>();

// GET /api/v1/health
health.get('/', getHealth);

export default health;
