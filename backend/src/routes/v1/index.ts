import { Hono } from 'hono';

import type { AppEnv } from '../../types';
import auth from './auth.routes';
import health from './health.routes';
import paymentWebhooks from './payment-webhooks.routes';
import notifications from './notifications.routes';
import payments from './payments.routes';
import propertyImages from './property-images.routes';
import properties from './properties.routes';
import rentalRequests from './rental-requests.routes';
import rentals from './rentals.routes';
import users from './users.routes';

/**
 * API v1 router. Mount v1 feature routers here.
 * B2 adds /auth; B3 adds /users (profiles); B4 adds /properties (management +
 * public detail); B5 adds property images (also under /properties).
 * Rental-requests, rentals, payments, notifications follow later.
 */
const v1 = new Hono<AppEnv>();

v1.route('/health', health);
v1.route('/auth', auth);
v1.route('/users', users);
// Image routes are mounted first so their more specific `/properties/...images`
// paths are matched alongside the base property routes.
v1.route('/properties', propertyImages);
v1.route('/properties', properties);
v1.route('/rental-requests', rentalRequests);
v1.route('/rentals', rentals);
v1.route('/payments', payments);
v1.route('/notifications', notifications);
v1.route('/payment-webhooks', paymentWebhooks);

export default v1;
