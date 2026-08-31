"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/session";
import { recordAudit } from "@/lib/server/audit";

/**
 * Fold a duplicate family record into the canonical one: every guardian,
 * diver (with medical/membership history), charge, invoice, credit, payment,
 * and portal login moves to `keepFamilyId`. The duplicate row itself is kept
 * (never deleted — it may be referenced by historical audit entries or the
 * original registration submission) but marked status="merged" so it drops
 * out of active family lists.
 */
export async function mergeFamilies(formData: FormData) {
  const session = await requireAdmin();
  const keepFamilyId = String(formData.get("keepFamilyId") || "");
  const mergeFamilyId = String(formData.get("mergeFamilyId") || "");

  if (!keepFamilyId || !mergeFamilyId) throw new Error("Pick both families.");
  if (keepFamilyId === mergeFamilyId) throw new Error("Can't merge a family into itself.");

  const [keep, merge] = await Promise.all([
    db.query.families.findFirst({ where: and(eq(tables.families.id, keepFamilyId), eq(tables.families.clubId, session.clubId)) }),
    db.query.families.findFirst({ where: and(eq(tables.families.id, mergeFamilyId), eq(tables.families.clubId, session.clubId)) }),
  ]);
  if (!keep || !merge) throw new Error("Family not found.");
  if (merge.status === "merged") throw new Error("That family has already been merged elsewhere.");

  await db.transaction(async (tx) => {
    await tx.update(tables.guardians).set({ familyId: keepFamilyId }).where(eq(tables.guardians.familyId, mergeFamilyId));
    await tx.update(tables.divers).set({ familyId: keepFamilyId }).where(eq(tables.divers.familyId, mergeFamilyId));
    await tx.update(tables.charges).set({ familyId: keepFamilyId }).where(eq(tables.charges.familyId, mergeFamilyId));
    await tx.update(tables.invoices).set({ familyId: keepFamilyId }).where(eq(tables.invoices.familyId, mergeFamilyId));
    await tx.update(tables.credits).set({ familyId: keepFamilyId }).where(eq(tables.credits.familyId, mergeFamilyId));
    await tx.update(tables.payments).set({ familyId: keepFamilyId }).where(eq(tables.payments.familyId, mergeFamilyId));
    await tx.update(tables.discountsAndAid).set({ familyId: keepFamilyId }).where(eq(tables.discountsAndAid.familyId, mergeFamilyId));
    await tx.update(tables.registrationSubmissions).set({ resultingFamilyId: keepFamilyId }).where(eq(tables.registrationSubmissions.resultingFamilyId, mergeFamilyId));
    // Repoint any portal login scoped to the old family.
    await tx.update(tables.clubMemberships).set({ familyId: keepFamilyId }).where(eq(tables.clubMemberships.familyId, mergeFamilyId));

    await tx.update(tables.families).set({
      status: "merged",
      notes: `${merge.notes ? merge.notes + "\n\n" : ""}Merged into "${keep.billingName}" (${keepFamilyId}) on ${new Date().toISOString().slice(0, 10)}.`,
    }).where(eq(tables.families.id, mergeFamilyId));

    await recordAudit(tx, {
      clubId: session.clubId,
      actorUserId: session.userId,
      action: "family.merge",
      entityType: "family",
      entityId: keepFamilyId,
      summary: `Merged "${merge.billingName}" into "${keep.billingName}"`,
      before: { mergedFamilyId: mergeFamilyId },
    });
  });

  revalidatePath(`/families/${keepFamilyId}`);
  revalidatePath("/families");
}

/** Create a portal login for a guardian who doesn't have one yet. */
export async function createGuardianLogin(formData: FormData) {
  const session = await requireAdmin();
  const guardianId = String(formData.get("guardianId") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const guardian = await db.query.guardians.findFirst({
    where: eq(tables.guardians.id, guardianId),
    with: { family: true },
  });
  if (!guardian || !guardian.email) throw new Error("This guardian needs an email on file first.");
  if (guardian.family.clubId !== session.clubId) throw new Error("Not found.");

  const email = guardian.email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    let user = await tx.query.users.findFirst({ where: eq(tables.users.email, email) });
    if (!user) {
      [user] = await tx.insert(tables.users).values({ email, name: guardian.name, passwordHash, active: true }).returning();
    } else {
      await tx.update(tables.users).set({ passwordHash, active: true }).where(eq(tables.users.id, user.id));
    }
    const existingMembership = await tx.query.clubMemberships.findFirst({
      where: and(eq(tables.clubMemberships.userId, user.id), eq(tables.clubMemberships.clubId, session.clubId)),
    });
    if (existingMembership) {
      await tx.update(tables.clubMemberships).set({ role: "family", familyId: guardian.familyId, active: true })
        .where(eq(tables.clubMemberships.id, existingMembership.id));
    } else {
      await tx.insert(tables.clubMemberships).values({
        clubId: session.clubId, userId: user.id, role: "family", familyId: guardian.familyId, active: true,
      });
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "family_login.create", entityType: "family", entityId: guardian.familyId,
      summary: `Created portal login for ${guardian.name} (${email})`,
    });
  });

  revalidatePath(`/families/${guardian.familyId}`);
}

/** Reset an existing guardian's portal password. */
export async function resetGuardianPassword(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const familyId = String(formData.get("familyId") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const membership = await db.query.clubMemberships.findFirst({
    where: and(eq(tables.clubMemberships.userId, userId), eq(tables.clubMemberships.clubId, session.clubId), eq(tables.clubMemberships.familyId, familyId)),
  });
  if (!membership) throw new Error("Login not found.");

  const passwordHash = await bcrypt.hash(password, 10);
  await db.transaction(async (tx) => {
    await tx.update(tables.users).set({ passwordHash }).where(eq(tables.users.id, userId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "family_login.reset_password", entityType: "family", entityId: familyId,
      summary: `Reset portal password for a guardian login`,
    });
  });
  revalidatePath(`/families/${familyId}`);
}

/** Deactivate or reactivate a guardian's portal access without touching family/billing records. */
export async function setGuardianLoginActive(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const familyId = String(formData.get("familyId") || "");
  const active = formData.get("active") === "true";

  const membership = await db.query.clubMemberships.findFirst({
    where: and(eq(tables.clubMemberships.userId, userId), eq(tables.clubMemberships.clubId, session.clubId), eq(tables.clubMemberships.familyId, familyId)),
  });
  if (!membership) throw new Error("Login not found.");

  await db.transaction(async (tx) => {
    await tx.update(tables.clubMemberships).set({ active }).where(eq(tables.clubMemberships.id, membership.id));
    await tx.update(tables.users).set({ active }).where(eq(tables.users.id, userId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: active ? "family_login.reactivate" : "family_login.deactivate",
      entityType: "family", entityId: familyId,
      summary: `${active ? "Reactivated" : "Deactivated"} a guardian's portal login`,
    });
  });
  revalidatePath(`/families/${familyId}`);
}
