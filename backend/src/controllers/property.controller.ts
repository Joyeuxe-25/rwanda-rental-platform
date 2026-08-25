import type { Context } from 'hono';

import { getDb } from '../db/client';
import { getAuthUser } from '../middleware/auth';
import * as propertyService from '../services/property.service';
import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';
import { logger } from '../lib/logger';
import { sendSuccess } from '../utils/apiResponse';
import type {
  CreatePropertyInput,
  ListPublicPropertiesQuery,
  UpdatePropertyInput,
} from '../validators/property.validators';

/** Read the required `:id` route param (guards the strict string|undefined type). */
function paramId(c: Context<AppEnv>): string {
  const id = c.req.param('id');
  if (!id) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
  return id;
}

/**
 * Property controllers (B4). Thin HTTP layer. The landlord identity always
 * comes from `getAuthUser(c)` (the server-side session), never from the body,
 * query, or URL. Responses use the standard envelope with `data.property` /
 * `data.properties`.
 */

/** POST /api/v1/properties — create (LANDLORD). */
export async function create(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const input = c.get('validatedBody') as CreatePropertyInput;
  const property = await propertyService.createProperty(getDb(c.env), landlordId, input);
  logger.info('property.created', { landlordId, propertyId: property.id });
  return sendSuccess(c, { property }, 201);
}

/** GET /api/v1/properties/mine — list own properties (LANDLORD). */
export async function listMine(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const properties = await propertyService.listMine(getDb(c.env), landlordId);
  return sendSuccess(c, { properties });
}

/** GET /api/v1/properties/mine/:id — own property detail (LANDLORD). */
export async function getMine(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const property = await propertyService.getMine(getDb(c.env), landlordId, paramId(c));
  return sendSuccess(c, { property });
}

/** PATCH /api/v1/properties/mine/:id — update own property (LANDLORD). */
export async function updateMine(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const input = c.get('validatedBody') as UpdatePropertyInput;
  const property = await propertyService.updateMine(getDb(c.env), landlordId, paramId(c), input);
  logger.info('property.updated', { landlordId, propertyId: property.id });
  return sendSuccess(c, { property });
}

/** DELETE /api/v1/properties/mine/:id — delete own property (LANDLORD). */
export async function deleteMine(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const id = paramId(c);
  await propertyService.deleteMine(getDb(c.env), landlordId, id);
  logger.info('property.deleted', { landlordId, propertyId: id });
  return sendSuccess(c, { message: 'Property deleted' });
}

/** PATCH /api/v1/properties/mine/:id/publish — publish own property (LANDLORD). */
export async function publish(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const property = await propertyService.publishMine(getDb(c.env), landlordId, paramId(c));
  logger.info('property.published', { landlordId, propertyId: property.id });
  return sendSuccess(c, { property });
}

/** PATCH /api/v1/properties/mine/:id/unpublish — unpublish own property (LANDLORD). */
export async function unpublish(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const property = await propertyService.unpublishMine(getDb(c.env), landlordId, paramId(c));
  logger.info('property.unpublished', { landlordId, propertyId: property.id });
  return sendSuccess(c, { property });
}

/** GET /api/v1/properties/:id — public detail (no auth; published only). */
export async function getPublic(c: Context<AppEnv>) {
  const property = await propertyService.getPublic(getDb(c.env), paramId(c));
  return sendSuccess(c, { property });
}

/**
 * GET /api/v1/properties (PUBLIC, B17) — published-only discovery with filters,
 * pagination, and safe sorting. No auth; usable by visitors, tenants, and
 * landlords alike. The validated query is on `c.get('validatedQuery')`.
 */
export async function listPublicProperties(c: Context<AppEnv>) {
  const query = c.get('validatedQuery') as ListPublicPropertiesQuery;
  const result = await propertyService.listPublishedProperties(getDb(c.env), query);
  return sendSuccess(c, result);
}
