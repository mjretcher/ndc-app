"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/server/session";
import { recordAudit } from "@/lib/server/audit";
import { sendTemplatedEmail } from "@/lib/server/notify";
import { parseDollarsToCents, formatCents } from "@/lib/money";
import { todayYMD, type YMD } from "@/lib/dates";

export async function updateDiver(formData: FormData) {
  const session = await requireCoach();
  const diverId = String(formData.get("diverId"));
  const diver = await db.query.divers.findFirst({
    where: and(eq(tables.divers.id, diverId), eq(tables.divers.clubId, session.clubId)),
  });
  if (!diver) throw new Error("Diver not found.");

  const patch = {
    legalName: String(formData.get("legalName") || diver.legalName),
    preferredName: String(formData.get("preferredName") || "") || null,
    school: String(formData.get("school") || "") || null,
    grade: String(formData.get("grade") || "") || null,
    status: String(formData.get("status") || diver.status) as "active" | "inactive" | "prospective",
    primaryGroupId: String(formData.get("primaryGroupId") || "") || null,
    activitiesNotes: String(formData.get("activitiesNotes") || "") || null,
  };
  await db.transaction(async (tx) => {
    await tx.update(tables.divers).set(patch).where(eq(tables.divers.id, diverId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "diver.update", entityType: "diver", entityId: diverId,
      summary: `Updated diver ${patch.preferredName || patch.legalName}`,
      before: { status: diver.status, primaryGroupId: diver.primaryGroupId },
      after: { status: patch.status, primaryGroupId: patch.primaryGroupId },
    });
  });
  revalidatePath(`/divers/${diverId}`);
  revalidatePath("/divers");
}

export async function updateDiverMedical(formData: FormData) {
  const session = await requireCoach();
  const diverId = String(formData.get("diverId"));
  const diver = await db.query.divers.findFirst({
    where: and(eq(tables.divers.id, diverId), eq(tables.divers.clubId, session.clubId)),
  });
  if (!diver) throw new Error("Diver not found.");
  const values = {
    allergies: String(formData.get("allergies") || "") || null,
    medicalConsiderations: String(formData.get("medicalConsiderations") || "") || null,
    emergencyNotes: String(formData.get("emergencyNotes") || "") || null,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx.insert(tables.diverMedical)
      .values({ diverId, ...values })
      .onConflictDoUpdate({ target: tables.diverMedical.diverId, set: values });
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "diver.medical.update", entityType: "diver", entityId: diverId,
      summary: "Updated safety & medical details", // never log the content itself
    });
  });
  revalidatePath(`/divers/${diverId}`);
}

export async function updateFamily(formData: FormData) {
  const session = await requireCoach();
  const familyId = String(formData.get("familyId"));
  const family = await db.query.families.findFirst({
    where: and(eq(tables.families.id, familyId), eq(tables.families.clubId, session.clubId)),
  });
  if (!family) throw new Error("Family not found.");
  await db.transaction(async (tx) => {
    await tx.update(tables.families).set({
      billingName: String(formData.get("billingName") || family.billingName),
      addressLine1: String(formData.get("addressLine1") || "") || null,
      city: String(formData.get("city") || "") || null,
      state: String(formData.get("state") || "") || null,
      zip: String(formData.get("zip") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      status: String(formData.get("status") || family.status),
    }).where(eq(tables.families.id, familyId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "family.update", entityType: "family", entityId: familyId,
      summary: `Updated family ${family.billingName}`,
    });
  });
  revalidatePath(`/families/${familyId}`);
}

export async function upsertGuardian(formData: FormData) {
  const session = await requireCoach();
  const familyId = String(formData.get("familyId"));
  const guardianId = String(formData.get("guardianId") || "");
  const values = {
    familyId,
    name: String(formData.get("name") || "").trim(),
    relationship: String(formData.get("relationship") || "") || null,
    email: String(formData.get("email") || "") || null,
    phone: String(formData.get("phone") || "") || null,
    isPrimary: formData.get("isPrimary") === "on",
    isEmergencyContact: formData.get("isEmergencyContact") === "on",
  };
  if (!values.name) throw new Error("Guardian name is required.");
  await db.transaction(async (tx) => {
    if (guardianId) {
      await tx.update(tables.guardians).set(values).where(eq(tables.guardians.id, guardianId));
    } else {
      await tx.insert(tables.guardians).values(values);
    }
    if (values.isPrimary) {
      // Only one primary per family.
      const others = await tx.query.guardians.findMany({ where: eq(tables.guardians.familyId, familyId) });
      for (const g of others) {
        if (g.name !== values.name && g.isPrimary) {
          await tx.update(tables.guardians).set({ isPrimary: false }).where(eq(tables.guardians.id, g.id));
        }
      }
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: guardianId ? "guardian.update" : "guardian.add",
      entityType: "family", entityId: familyId,
      summary: `${guardianId ? "Updated" : "Added"} guardian ${values.name}`,
    });
  });
  revalidatePath(`/families/${familyId}`);
}

export async function assignPlan(formData: FormData) {
  const session = await requireCoach();
  const diverId = String(formData.get("diverId"));
  const planId = String(formData.get("planId"));
  const effectiveStart = String(formData.get("effectiveStart") || todayYMD()) as YMD;
  const overrideRaw = String(formData.get("overrideAmount") || "").trim();
  const overrideAmountCents = overrideRaw ? parseDollarsToCents(overrideRaw) : null;
  const notes = String(formData.get("notes") || "") || null;

  const diver = await db.query.divers.findFirst({
    where: and(eq(tables.divers.id, diverId), eq(tables.divers.clubId, session.clubId)),
    with: { planAssignments: true },
  });
  if (!diver) throw new Error("Diver not found.");
  const plan = await db.query.billingPlans.findFirst({
    where: and(eq(tables.billingPlans.id, planId), eq(tables.billingPlans.clubId, session.clubId)),
  });
  if (!plan) throw new Error("Plan not found.");

  await db.transaction(async (tx) => {
    // Close out any open-ended assignment as of the day before the new start.
    for (const a of diver.planAssignments) {
      if (a.effectiveEnd === null && (a.effectiveStart as YMD) < effectiveStart) {
        const dayBefore = new Date(Date.parse(effectiveStart) - 86400000).toISOString().slice(0, 10);
        await tx.update(tables.diverPlanAssignments).set({ effectiveEnd: dayBefore })
          .where(eq(tables.diverPlanAssignments.id, a.id));
      }
    }
    const [row] = await tx.insert(tables.diverPlanAssignments).values({
      diverId, planId, effectiveStart, overrideAmountCents, notes,
    }).returning({ id: tables.diverPlanAssignments.id });
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "diver.plan.assign", entityType: "diver", entityId: diverId,
      summary: `Assigned "${plan.name}" from ${effectiveStart}${overrideAmountCents != null ? ` (override ${formatCents(overrideAmountCents)})` : ""}`,
      after: { assignmentId: row.id },
    });
  });
  revalidatePath(`/divers/${diverId}`);
}

export async function updateMembership(formData: FormData) {
  const session = await requireCoach();
  const diverId = String(formData.get("diverId"));
  const organization = String(formData.get("organization")) as "aau" | "usa_diving";
  const diver = await db.query.divers.findFirst({
    where: and(eq(tables.divers.id, diverId), eq(tables.divers.clubId, session.clubId)),
  });
  if (!diver) throw new Error("Diver not found.");

  const values = {
    membershipNumber: String(formData.get("membershipNumber") || "") || null,
    membershipType: String(formData.get("membershipType") || "") || null,
    expirationDate: (String(formData.get("expirationDate") || "") || null) as YMD | null,
    verification: String(formData.get("verification") || "missing") as "missing" | "pending" | "verified" | "expired",
    notes: String(formData.get("notes") || "") || null,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    const existing = await tx.query.diverMemberships.findFirst({
      where: and(eq(tables.diverMemberships.diverId, diverId), eq(tables.diverMemberships.organization, organization)),
    });
    if (existing) {
      await tx.update(tables.diverMemberships).set(values).where(eq(tables.diverMemberships.id, existing.id));
    } else {
      await tx.insert(tables.diverMemberships).values({ diverId, organization, ...values });
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "membership.update", entityType: "diver", entityId: diverId,
      summary: `${organization === "aau" ? "AAU" : "USA Diving"} membership → ${values.verification}`,
    });
  });
  revalidatePath(`/divers/${diverId}`);
  revalidatePath("/memberships");
}

/** Send the "membership missing" nudge with a link to the club's guide. */
export async function sendMembershipReminder(formData: FormData) {
  const session = await requireCoach();
  const diverId = String(formData.get("diverId"));
  const organization = String(formData.get("organization")) as "aau" | "usa_diving";
  const diver = await db.query.divers.findFirst({
    where: and(eq(tables.divers.id, diverId), eq(tables.divers.clubId, session.clubId)),
    with: { family: { with: { guardians: true } }, memberships: true },
  });
  if (!diver) throw new Error("Diver not found.");
  const primary = diver.family.guardians.find((g) => g.isPrimary && g.email) ?? diver.family.guardians.find((g) => g.email);
  if (!primary?.email) throw new Error("This family has no guardian email on file.");

  const m = diver.memberships.find((x) => x.organization === organization);
  const detail = m?.verification === "expired" ? "expired" : "missing or unverified";
  const orgLabel = organization === "aau" ? "AAU" : "USA Diving";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  await sendTemplatedEmail({
    clubId: session.clubId,
    eventType: "membership_missing",
    recipientEmail: primary.email,
    fields: {
      guardian_name: primary.name,
      diver_name: diver.preferredName || diver.legalName,
      organization: orgLabel,
      detail,
      guide_url: `${base}/guides/${organization === "aau" ? "aau" : "usa-diving"}`,
    },
  });
  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "membership.remind", entityType: "diver", entityId: diverId,
      summary: `Sent ${orgLabel} membership reminder to ${primary.email}`,
    });
  });
  revalidatePath("/memberships");
}

export async function addDiscount(formData: FormData) {
  const session = await requireCoach();
  const familyId = String(formData.get("familyId"));
  const diverId = String(formData.get("diverId") || "") || null;
  const kind = String(formData.get("kind")) as "fixed" | "percent";
  const label = String(formData.get("label") || "").trim();
  if (!label) throw new Error("Give the discount a label.");
  const amountCents = kind === "fixed" ? parseDollarsToCents(String(formData.get("amount"))) : null;
  const percent = kind === "percent" ? Number(formData.get("percent")) : null;
  if (kind === "percent" && (!percent || percent < 1 || percent > 100)) throw new Error("Percent must be 1–100.");

  await db.transaction(async (tx) => {
    await tx.insert(tables.discountsAndAid).values({
      familyId, diverId, kind, label, amountCents, percent,
      effectiveStart: String(formData.get("effectiveStart") || todayYMD()),
      effectiveEnd: String(formData.get("effectiveEnd") || "") || null,
      approvedByUserId: session.userId,
    });
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "discount.add", entityType: "family", entityId: familyId,
      summary: `Added ${kind === "fixed" ? formatCents(amountCents!) : `${percent}%`} discount: ${label}`,
    });
  });
  revalidatePath(`/families/${familyId}`);
}

export async function endDiscount(formData: FormData) {
  const session = await requireCoach();
  const id = String(formData.get("discountId"));
  const familyId = String(formData.get("familyId"));
  await db.transaction(async (tx) => {
    await tx.update(tables.discountsAndAid).set({ active: false, effectiveEnd: todayYMD() })
      .where(eq(tables.discountsAndAid.id, id));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "discount.end", entityType: "family", entityId: familyId,
      summary: "Ended a discount",
    });
  });
  revalidatePath(`/families/${familyId}`);
}
