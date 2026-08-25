import { z } from 'zod';

/**
 * Property validators (B4). Strict schemas — unknown keys are rejected (422),
 * which structurally blocks mass-assignment of server-controlled fields
 * (`id`, `landlordId`, `status`, `isPublished`, `currency`, `tenantId`,
 * `rentalId`, timestamps, ...).
 *
 * Money and counts are INTEGER and non-negative (whole RWF; no floats).
 */
const titleSchema = z.string().trim().min(1, 'Title is required').max(200);
const descriptionSchema = z.string().trim().max(5000);
const propertyTypeSchema = z.enum(['APARTMENT', 'HOUSE', 'ROOM', 'STUDIO', 'OTHER']);
const countSchema = z.number().int('Must be a whole number').min(0).max(1000);
const moneySchema = z
  .number()
  .int('Amount must be a whole number of RWF')
  .min(0, 'Amount cannot be negative')
  .max(1_000_000_000);
const locRequired = z.string().trim().min(1).max(100);
const locOptional = z.string().trim().min(1).max(100);
const amenitiesSchema = z.array(z.string().trim().min(1).max(50)).max(30);

export const createPropertySchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
    propertyType: propertyTypeSchema,
    bedrooms: countSchema.optional().default(0),
    bathrooms: countSchema.optional().default(0),
    monthlyRent: moneySchema,
    securityDeposit: moneySchema.optional().default(0),
    otherCharges: moneySchema.optional().default(0),
    province: locRequired,
    district: locRequired,
    sector: locRequired,
    cell: locOptional.optional(),
    village: locOptional.optional(),
    additionalLocation: z.string().trim().max(500).optional(),
    amenities: amenitiesSchema.optional().default([]),
  })
  .strict();

export const updatePropertySchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    propertyType: propertyTypeSchema.optional(),
    bedrooms: countSchema.optional(),
    bathrooms: countSchema.optional(),
    monthlyRent: moneySchema.optional(),
    securityDeposit: moneySchema.optional(),
    otherCharges: moneySchema.optional(),
    province: locRequired.optional(),
    district: locRequired.optional(),
    sector: locRequired.optional(),
    cell: locOptional.optional(),
    village: locOptional.optional(),
    additionalLocation: z.string().trim().max(500).optional(),
    amenities: amenitiesSchema.optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

/**
 * Public property discovery query (B17). Strict — unknown query params are
 * rejected (422), consistent with the property module's strict convention. All
 * numeric params are integers (whole RWF / whole counts; no floats). Filters map
 * only to real schema columns; `is_published = true` is enforced server-side
 * regardless of these filters. `sort` is a fixed allow-list (never raw SQL).
 */
const propertyStatusSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'UNAVAILABLE']);
const intRent = z.coerce
  .number()
  .int('Rent must be a whole number of RWF')
  .min(0, 'Rent cannot be negative')
  .max(1_000_000_000);
const intCount = z.coerce.number().int('Must be a whole number').min(0).max(1000);
const locFilter = z.string().trim().min(1).max(100);

export const listPublicPropertiesQuerySchema = z
  .object({
    page: z.coerce.number().int('Invalid page').min(1, 'Invalid page').default(1),
    limit: z.coerce.number().int('Invalid limit').min(1).max(100).default(12),
    province: locFilter.optional(),
    district: locFilter.optional(),
    sector: locFilter.optional(),
    cell: locFilter.optional(),
    villageOrArea: locFilter.optional(),
    propertyType: propertyTypeSchema.optional(),
    status: propertyStatusSchema.optional(),
    minRent: intRent.optional(),
    maxRent: intRent.optional(),
    bedrooms: intCount.optional(),
    bathrooms: intCount.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(['newest', 'rent_asc', 'rent_desc']).default('newest'),
  })
  .strict()
  .refine((v) => v.minRent === undefined || v.maxRent === undefined || v.minRent <= v.maxRent, {
    message: 'minRent must be less than or equal to maxRent',
    path: ['minRent'],
  });

export type ListPublicPropertiesQuery = z.infer<typeof listPublicPropertiesQuerySchema>;
