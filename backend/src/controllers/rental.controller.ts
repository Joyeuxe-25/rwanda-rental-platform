import type { Context } from 'hono';

import { getDb } from '../db/client';
import { getAuthUser } from '../middleware/auth';
import * as service from '../services/rental.service';
import type { AppEnv } from '../types';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import type { CreateRentalInput } from '../validators/rental.validators';

/**
 * Rental controllers (B7). Thin HTTP layer: user identity from the session,
 * ids from route params. Business rules live in the service.
 */
function param(c: Context<AppEnv>, name: string): string {
  const v = c.req.param(name);
  if (!v) throw ApiError.notFound('Rental not found', 'RENTAL_NOT_FOUND');
  return v;
}

// --- Tenant ---
export async function createFromRequest(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const input = c.get('validatedBody') as CreateRentalInput;
  const rental = await service.createFromRequest(
    getDb(c.env),
    tenantId,
    param(c, 'rentalRequestId'),
    input,
  );
  return sendSuccess(c, { rental }, 201);
}

export async function listMine(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const rentals = await service.listMine(getDb(c.env), tenantId);
  return sendSuccess(c, { rentals });
}

export async function getMine(c: Context<AppEnv>) {
  const { id: tenantId } = getAuthUser(c);
  const rental = await service.getMine(getDb(c.env), tenantId, param(c, 'id'));
  return sendSuccess(c, { rental });
}

// --- Landlord ---
export async function listLandlord(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const rentals = await service.listForLandlord(getDb(c.env), landlordId);
  return sendSuccess(c, { rentals });
}

export async function getLandlord(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const rental = await service.getForLandlord(getDb(c.env), landlordId, param(c, 'id'));
  return sendSuccess(c, { rental });
}

export async function complete(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const rental = await service.completeRental(getDb(c.env), landlordId, param(c, 'id'));
  return sendSuccess(c, { rental });
}

export async function terminate(c: Context<AppEnv>) {
  const { id: landlordId } = getAuthUser(c);
  const rental = await service.terminateRental(getDb(c.env), landlordId, param(c, 'id'));
  return sendSuccess(c, { rental });
}
