import type { Context } from 'hono';

import { getDb } from '../db/client';
import { getAuthUser } from '../middleware/auth';
import * as service from '../services/rental-request.service';
import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import type { CreateRentalRequestInput } from '../validators/rental-request.validators';

/**
 * Rental-request controllers (B6). Thin HTTP layer: the authenticated user id
 * is always taken from the session (tenant for /mine, landlord for /landlord);
 * ids come from route params. Business rules live in the service.
 */
function paramId(c: Context<AppEnv>): string {
  const id = c.req.param('id');
  if (!id) throw ApiError.notFound('Rental request not found', 'RENTAL_REQUEST_NOT_FOUND');
  return id;
}

// --- Tenant ---
export async function create(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const input = c.get('validatedBody') as CreateRentalRequestInput;
  const rentalRequest = await service.createRequest(getDb(c.env), tenantId, input);
  return sendSuccess(c, { rentalRequest }, 201);
}

export async function listMine(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const rentalRequests = await service.listMine(getDb(c.env), tenantId);
  return sendSuccess(c, { rentalRequests });
}

export async function getMine(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const rentalRequest = await service.getMine(getDb(c.env), tenantId, paramId(c));
  return sendSuccess(c, { rentalRequest });
}

export async function cancelMine(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const rentalRequest = await service.cancelMine(getDb(c.env), tenantId, paramId(c));
  return sendSuccess(c, { rentalRequest });
}

// --- Landlord ---
export async function listLandlord(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const rentalRequests = await service.listForLandlord(getDb(c.env), landlordId);
  return sendSuccess(c, { rentalRequests });
}

export async function getLandlord(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const rentalRequest = await service.getForLandlord(getDb(c.env), landlordId, paramId(c));
  return sendSuccess(c, { rentalRequest });
}

export async function approve(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const rentalRequest = await service.approve(getDb(c.env), landlordId, paramId(c));
  return sendSuccess(c, { rentalRequest });
}

export async function reject(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const rentalRequest = await service.reject(getDb(c.env), landlordId, paramId(c));
  return sendSuccess(c, { rentalRequest });
}
