"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/session";
import { recordAudit } from "@/lib/server/audit";
import { retryFailedJobs } from "@/lib/server/notify";
import { parseDollarsToCents, formatCents } from "@/lib/money";
import type { YMD } from "@/lib/dates";

// --- Rates -----------------------------------------------------------------
export async function addRate(formData: FormData) {
  const session = await requireAdmin();
  const groupId = String(formData.get("groupId") || "") || null;
  const category = String(formData.get("category")) as "weekday" | "sunday" | "clinic" | "non_billable";
  const amountCents = parseDollarsToCents(String(formData.get("amount")));
  const effectiveStart = String(formData.get("effectiveStart")) as YMD;
  if (!effectiveStart) throw new Error("Set an effective start date.");

  await db.transaction(async (tx) => {
    // Close the currently open rate for the same slot the day before.
    const open = await tx.query.rateSchedules.findMany({
      where: and(
        eq(tables.rateSchedules.clubId, session.clubId),
        groupId ? eq(tables.rateSchedules.groupId, groupId) : eq(tables.rateSchedules.category, category),
        eq(tables.rateSchedules.category, category),
      ),
    });
    for (const r of open) {
      if (r.groupId === groupId && r.effectiveEnd === null && (r.effectiveStart as YMD) < effectiveStart) {
        const dayBefore = new Date(Date.parse(effectiveStart) - 86400000).toISOString().slice(0, 10);
        await tx.update(tables.rateSchedules).set({ effectiveEnd: dayBefore }).where(eq(tables.rateSchedules.id, r.id));
      }
    }
    await tx.insert(tables.rateSchedules).values({
      clubId: session.clubId, groupId, category, amountCents, effectiveStart,
    });
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "rate.add", entityType: "rate_schedule", entityId: null,
      summary: `New ${category} rate ${formatCents(amountCents)} effective ${effectiveStart}`,
    });
  });
  revalidatePath("/settings/pricing");
}

export async function confirmRate(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("rateId"));
  await db.update(tables.rateSchedules).set({ confirmBeforeLaunch: false })
    .where(and(eq(tables.rateSchedules.id, id), eq(tables.rateSchedules.clubId, session.clubId)));
  revalidatePath("/settings/pricing");
}

// --- Plans -----------------------------------------------------------------
export async function upsertPlan(formData: FormData) {
  const session = await requireAdmin();
  const planId = String(formData.get("planId") || "");
  const planType = String(formData.get("planType")) as "flat_monthly" | "per_practice" | "seasonal_installment" | "custom";
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Plan needs a name.");
  const amountRaw = String(formData.get("amount") || "").trim();
  const totalRaw = String(formData.get("installmentTotal") || "").trim();
  const monthsRaw = String(formData.get("installmentMonths") || "").trim();
  const values = {
    clubId: session.clubId,
    name,
    planType,
    groupId: String(formData.get("groupId") || "") || null,
    amountCents: planType === "flat_monthly" && amountRaw ? parseDollarsToCents(amountRaw) : null,
    installmentTotalCents: planType === "seasonal_installment" && totalRaw ? parseDollarsToCents(totalRaw) : null,
    installmentMonths: planType === "seasonal_installment" && monthsRaw
      ? monthsRaw.split(",").map((m) => Number(m.trim())).filter((m) => m >= 1 && m <= 12)
      : null,
    notes: String(formData.get("notes") || "") || null,
    active: formData.get("active") !== "off",
    confirmBeforeLaunch: false,
  };
  await db.transaction(async (tx) => {
    if (planId) {
      await tx.update(tables.billingPlans).set(values).where(and(eq(tables.billingPlans.id, planId), eq(tables.billingPlans.clubId, session.clubId)));
    } else {
      await tx.insert(tables.billingPlans).values(values);
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: planId ? "plan.update" : "plan.add", entityType: "billing_plan", entityId: planId || null,
      summary: `${planId ? "Updated" : "Added"} plan "${name}"`,
    });
  });
  revalidatePath("/settings/pricing");
}

// --- Groups & facilities ---------------------------------------------------
export async function upsertGroup(formData: FormData) {
  const session = await requireAdmin();
  const groupId = String(formData.get("groupId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Group needs a name.");
  const values = {
    clubId: session.clubId,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    colorToken: String(formData.get("colorToken") || "") || null,
    sortOrder: Number(formData.get("sortOrder") || 0),
    active: formData.get("active") !== "off",
  };
  await db.transaction(async (tx) => {
    if (groupId) {
      await tx.update(tables.groups).set(values).where(and(eq(tables.groups.id, groupId), eq(tables.groups.clubId, session.clubId)));
    } else {
      await tx.insert(tables.groups).values(values);
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: groupId ? "group.update" : "group.add", entityType: "group", entityId: groupId || null,
      summary: `${groupId ? "Updated" : "Added"} group "${name}"`,
    });
  });
  revalidatePath("/settings/club");
}

export async function upsertFacility(formData: FormData) {
  const session = await requireAdmin();
  const facilityId = String(formData.get("facilityId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Facility needs a name.");
  const values = {
    clubId: session.clubId,
    name,
    address: String(formData.get("address") || "") || null,
    entryNotes: String(formData.get("entryNotes") || "") || null,
    active: formData.get("active") !== "off",
  };
  await db.transaction(async (tx) => {
    if (facilityId) {
      await tx.update(tables.facilities).set(values).where(and(eq(tables.facilities.id, facilityId), eq(tables.facilities.clubId, session.clubId)));
    } else {
      await tx.insert(tables.facilities).values(values);
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: facilityId ? "facility.update" : "facility.add", entityType: "facility", entityId: facilityId || null,
      summary: `${facilityId ? "Updated" : "Added"} facility "${name}"`,
    });
  });
  revalidatePath("/settings/club");
}

export async function updateClub(formData: FormData) {
  const session = await requireAdmin();
  await db.transaction(async (tx) => {
    await tx.update(tables.clubs).set({
      contactEmail: String(formData.get("contactEmail") || "") || null,
      contactPhone: String(formData.get("contactPhone") || "") || null,
      invoiceTerms: String(formData.get("invoiceTerms") || "") || null,
      invoicePrefix: String(formData.get("invoicePrefix") || "NDC"),
    }).where(eq(tables.clubs.id, session.clubId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "club.update", entityType: "club", entityId: session.clubId,
      summary: "Updated club settings",
    });
  });
  revalidatePath("/settings/club");
}

export async function setEligibilityMode(formData: FormData) {
  const session = await requireAdmin();
  const mode = String(formData.get("mode")) as "off" | "warn" | "enforce";
  await db.transaction(async (tx) => {
    const existing = await tx.query.eligibilityRules.findFirst({ where: eq(tables.eligibilityRules.clubId, session.clubId) });
    if (existing) {
      await tx.update(tables.eligibilityRules).set({ mode, updatedAt: new Date() }).where(eq(tables.eligibilityRules.id, existing.id));
    } else {
      await tx.insert(tables.eligibilityRules).values({ clubId: session.clubId, mode });
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "eligibility.mode", entityType: "club", entityId: session.clubId,
      summary: `Membership eligibility mode → ${mode}`,
    });
  });
  revalidatePath("/settings/club");
}

// --- Guides ----------------------------------------------------------------
export async function updateGuide(formData: FormData) {
  const session = await requireAdmin();
  const guideId = String(formData.get("guideId"));
  await db.transaction(async (tx) => {
    const guide = await tx.query.externalGuides.findFirst({
      where: and(eq(tables.externalGuides.id, guideId), eq(tables.externalGuides.clubId, session.clubId)),
    });
    if (!guide) throw new Error("Guide not found.");
    await tx.update(tables.externalGuides).set({
      title: String(formData.get("title") || guide.title),
      bodyMarkdown: String(formData.get("bodyMarkdown") || guide.bodyMarkdown),
      clubCode: String(formData.get("clubCode") || "") || null,
      lastVerifiedAt: String(formData.get("lastVerifiedAt") || "") || null,
      verifiedBy: String(formData.get("verifiedBy") || "") || null,
      version: guide.version + 1,
      updatedAt: new Date(),
    }).where(eq(tables.externalGuides.id, guideId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "guide.update", entityType: "external_guide", entityId: guideId,
      summary: `Updated ${guide.organization === "aau" ? "AAU" : "USA Diving"} guide (v${guide.version + 1})`,
    });
  });
  revalidatePath("/settings/guides");
  revalidatePath("/guides/aau");
  revalidatePath("/guides/usa-diving");
}

// --- Notification templates ------------------------------------------------
export async function updateTemplate(formData: FormData) {
  const session = await requireAdmin();
  const templateId = String(formData.get("templateId"));
  await db.transaction(async (tx) => {
    await tx.update(tables.notificationTemplates).set({
      subject: String(formData.get("subject") || ""),
      body: String(formData.get("body") || ""),
      active: formData.get("active") === "on",
      updatedAt: new Date(),
    }).where(and(eq(tables.notificationTemplates.id, templateId), eq(tables.notificationTemplates.clubId, session.clubId)));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "template.update", entityType: "notification_template", entityId: templateId,
      summary: "Updated notification template",
    });
  });
  revalidatePath("/settings/notifications");
}

export async function retryNotifications() {
  const session = await requireAdmin();
  const n = await retryFailedJobs(session.clubId);
  revalidatePath("/settings/notifications");
  return { retried: n };
}

// --- Users -----------------------------------------------------------------
export async function upsertCoach(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "coach") as "owner_admin" | "coach";
  const password = String(formData.get("password") || "");
  if (!email || !name) throw new Error("Name and email are required.");

  await db.transaction(async (tx) => {
    let uid = userId;
    if (uid) {
      const patch: Record<string, unknown> = { name, email, active: formData.get("active") !== "off" };
      if (password) patch.passwordHash = await bcrypt.hash(password, 10);
      await tx.update(tables.users).set(patch).where(eq(tables.users.id, uid));
      await tx.update(tables.clubMemberships).set({ role })
        .where(and(eq(tables.clubMemberships.userId, uid), eq(tables.clubMemberships.clubId, session.clubId)));
    } else {
      if (!password) throw new Error("Set an initial password for the new coach.");
      const [u] = await tx.insert(tables.users).values({
        email, name, passwordHash: await bcrypt.hash(password, 10),
      }).returning({ id: tables.users.id });
      uid = u.id;
      await tx.insert(tables.clubMemberships).values({ clubId: session.clubId, userId: uid, role });
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: userId ? "user.update" : "user.add", entityType: "user", entityId: uid,
      summary: `${userId ? "Updated" : "Added"} ${role === "owner_admin" ? "admin" : "coach"} ${name}`,
    });
  });
  revalidatePath("/settings/users");
}

// --- CSV import ------------------------------------------------------------
export async function previewImportAction(_prev: unknown, formData: FormData) {
  const session = await requireAdmin();
  const csvText = await readCsvField(formData);
  if (!csvText) return { error: "Paste CSV text or choose a file." };
  const { buildImportPreview } = await import("@/lib/server/import");
  const preview = await buildImportPreview(csvText, session.clubId);
  return { preview, csvText };
}

export async function commitImportAction(_prev: unknown, formData: FormData) {
  const session = await requireAdmin();
  const csvText = String(formData.get("csvText") || "");
  if (!csvText) return { error: "Nothing to import — run a preview first." };
  const { commitImport } = await import("@/lib/server/import");
  const result = await commitImport(csvText, session.clubId, session.userId);
  revalidatePath("/families");
  revalidatePath("/divers");
  return { result };
}

async function readCsvField(formData: FormData): Promise<string> {
  const file = formData.get("csvFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > 1_000_000) throw new Error("CSV must be under 1 MB.");
    return await file.text();
  }
  return String(formData.get("csvText") || "").trim();
}

export async function deactivateCoach(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId"));
  if (userId === session.userId) throw new Error("You can't deactivate your own account.");
  await db.transaction(async (tx) => {
    await tx.update(tables.users).set({ active: false }).where(eq(tables.users.id, userId));
    await tx.update(tables.clubMemberships).set({ active: false })
      .where(and(eq(tables.clubMemberships.userId, userId), eq(tables.clubMemberships.clubId, session.clubId)));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "user.deactivate", entityType: "user", entityId: userId,
      summary: "Deactivated a coach account",
    });
  });
  revalidatePath("/settings/users");
}
