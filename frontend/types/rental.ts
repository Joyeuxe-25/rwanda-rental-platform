/**
 * Rental view types, mapped explicitly from the approved backend B7 contract
 * (`backend/openapi.json` + the rental service). The frontend NEVER sends
 * server-controlled fields: conversion sends at most `{ startDate?, endDate? }`,
 * and identity (tenant/landlord/property), money, and status are all derived by
 * the backend from the ACCEPTED request + property.
 */

/** Backend rental lifecycle. */
export type RentalStatus = 'ACTIVE' | 'COMPLETED' | 'TERMINATED';

/**
 * Compact property summary embedded in every rental response (B7
 * `propertySummary`). Note: it carries NO images and NO money — the money lives
 * on the rental itself (a server-snapshotted amount).
 */
export interface RentalPropertySummary {
  id: string;
  title: string;
  propertyType: string;
  district: string;
  sector: string;
  status: string;
}

/** The safe display identity of the other party (name only — no contact details). */
export interface RentalPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** Fields shared by both party views (the B7 `rentalBase`). */
interface RentalBase {
  id: string;
  propertyId: string;
  rentalRequestId: string | null;
  status: RentalStatus;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  securityDeposit: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  property: RentalPropertySummary;
}

/** Tenant-facing rental (sees the landlord's display identity). */
export interface TenantRental extends RentalBase {
  landlord: RentalPerson;
}

/** Landlord-facing rental (sees the tenant's display identity). */
export interface LandlordRental extends RentalBase {
  tenant: RentalPerson;
}

/** The ONLY fields a client may send when converting a request (B7 strict schema). */
export interface CreateRentalInput {
  startDate?: string;
  endDate?: string;
}

/** True once a rental has reached a terminal state (cannot transition further). */
export function isTerminalRentalStatus(status: RentalStatus): boolean {
  return status !== 'ACTIVE';
}
