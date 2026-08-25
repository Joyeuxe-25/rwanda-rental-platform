/**
 * Drizzle ORM schema — Cloudflare D1 (SQLite).
 *
 * B1 — Database Architecture. Seven core MVP entities plus a shared column
 * helper module (_shared.ts). No application services/controllers/routes exist
 * for these entities yet; this file only defines the data model and exports it
 * for the Drizzle client and migrations.
 *
 * Key business constraints encoded here:
 *   - One property = one rental unit (no building/units hierarchy).
 *   - One property = at most one ACTIVE rental (partial unique index on rentals).
 *   - One tenant = many ACTIVE rentals (allowed).
 *   - A payment belongs to a specific rental.
 *   - Money is INTEGER whole RWF; timestamps are epoch-ms integers.
 */
export * from './users';
export * from './properties';
export * from './property-images';
export * from './rental-requests';
export * from './rentals';
export * from './payments';
export * from './notifications';

// --- B2 authentication tables ---
export * from './sessions';
export * from './password-reset-tokens';

// --- B9 payment provider events ---
export * from './payment-provider-events';
