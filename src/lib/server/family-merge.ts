import "server-only";
import { eq } from "drizzle-orm";
import { tables } from "@/db";
import type { Db } from "@/db";

export type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Family status for a coach-created record whose family hasn't submitted the registration form yet. */
export const UNREGISTERED_FAMILY_STATUS = "unregistered";

export function familyStatusLabel(status: string): string {
  if (status === UNREGISTERED_FAMILY_STATUS) return "Not yet registered";
  return status;
}

/**
 * Move every family-scoped record (divers, money, submissions, portal logins)
 * from one family to another. Guardians are NOT handled here — callers decide
 * whether duplicate/placeholder contacts are dropped or carried over.
 * Does not touch the source family row itself.
 */
export async function repointFamilyRecords(tx: Tx, fromFamilyId: string, toFamilyId: string) {
  await tx.update(tables.divers).set({ familyId: toFamilyId }).where(eq(tables.divers.familyId, fromFamilyId));
  await tx.update(tables.charges).set({ familyId: toFamilyId }).where(eq(tables.charges.familyId, fromFamilyId));
  await tx.update(tables.invoices).set({ familyId: toFamilyId }).where(eq(tables.invoices.familyId, fromFamilyId));
  await tx.update(tables.credits).set({ familyId: toFamilyId }).where(eq(tables.credits.familyId, fromFamilyId));
  await tx.update(tables.payments).set({ familyId: toFamilyId }).where(eq(tables.payments.familyId, fromFamilyId));
  await tx.update(tables.discountsAndAid).set({ familyId: toFamilyId }).where(eq(tables.discountsAndAid.familyId, fromFamilyId));
  await tx.update(tables.waivers).set({ familyId: toFamilyId }).where(eq(tables.waivers.familyId, fromFamilyId));
  await tx.update(tables.registrationSubmissions).set({ resultingFamilyId: toFamilyId }).where(eq(tables.registrationSubmissions.resultingFamilyId, fromFamilyId));
  await tx.update(tables.clubMemberships).set({ familyId: toFamilyId }).where(eq(tables.clubMemberships.familyId, fromFamilyId));
}
