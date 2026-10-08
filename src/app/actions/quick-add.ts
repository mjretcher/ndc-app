"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/server/session";
import { recordAudit } from "@/lib/server/audit";
import { UNREGISTERED_FAMILY_STATUS } from "@/lib/server/family-merge";
import { todayYMD, type YMD } from "@/lib/dates";

export type QuickAddInput = {
  name: string;
  groupId?: string | null;
  planId?: string | null;
  startDate?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
};

export type QuickAddResult = {
  diverId: string;
  name: string;
  group: string | null;
  groupColor: string | null;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Put a diver on the books before their family has registered, so coaches
 * can take attendance (and bill) right away. Creates a placeholder family
 * marked "Not yet registered"; when the family's real registration comes in,
 * the approval screen links it to this diver instead of creating a duplicate.
 */
export async function quickAddDiver(input: QuickAddInput): Promise<QuickAddResult> {
  const session = await requireCoach();
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Enter the diver's name.");

  const today = todayYMD();
  let startDate = (input.startDate && YMD_RE.test(input.startDate) ? input.startDate : today) as YMD;
  if (startDate > today) startDate = today;

  const group = input.groupId
    ? await db.query.groups.findFirst({ where: and(eq(tables.groups.id, input.groupId), eq(tables.groups.clubId, session.clubId)) })
    : null;
  if (input.groupId && !group) throw new Error("Group not found.");
  const plan = input.planId
    ? await db.query.billingPlans.findFirst({ where: and(eq(tables.billingPlans.id, input.planId), eq(tables.billingPlans.clubId, session.clubId)) })
    : null;
  if (input.planId && !plan) throw new Error("Billing plan not found.");

  const parentName = input.parentName?.trim() || null;
  const parentEmail = input.parentEmail?.trim().toLowerCase() || null;
  const parentPhone = input.parentPhone?.trim() || null;
  const lastName = name.split(" ").slice(-1)[0];

  const diverId = await db.transaction(async (tx) => {
    const [family] = await tx.insert(tables.families).values({
      clubId: session.clubId,
      billingName: parentName ? `${parentName} (${lastName} family)` : `${name} — family`,
      status: UNREGISTERED_FAMILY_STATUS,
      notes: `Quick-added by a coach on ${today} before the family registered. Link it when their registration arrives.`,
    }).returning();

    if (parentName || parentEmail || parentPhone) {
      await tx.insert(tables.guardians).values({
        familyId: family.id,
        name: parentName ?? "Parent/guardian",
        email: parentEmail,
        phone: parentPhone,
        isPrimary: true,
      });
    }

    const [diver] = await tx.insert(tables.divers).values({
      clubId: session.clubId,
      familyId: family.id,
      legalName: name,
      status: "active",
      startDate,
      primaryGroupId: group?.id ?? null,
    }).returning();

    if (plan) {
      await tx.insert(tables.diverPlanAssignments).values({
        diverId: diver.id, planId: plan.id, effectiveStart: startDate,
        notes: "Set at quick add",
      });
    }

    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "diver.quick_add", entityType: "diver", entityId: diver.id,
      summary: `Quick-added ${name} (not yet registered)${group ? ` to ${group.name}` : ""}${plan ? ` on "${plan.name}"` : ""}`,
      after: { familyId: family.id },
    });
    return diver.id;
  });

  revalidatePath("/divers");
  revalidatePath("/families");
  return { diverId, name, group: group?.name ?? null, groupColor: group?.colorToken ?? null };
}

/** Form wrapper for the Divers page — creates the diver and opens their record. */
export async function quickAddDiverForm(formData: FormData) {
  const r = await quickAddDiver({
    name: String(formData.get("name") || ""),
    groupId: String(formData.get("groupId") || "") || null,
    planId: String(formData.get("planId") || "") || null,
    startDate: String(formData.get("startDate") || "") || null,
    parentName: String(formData.get("parentName") || "") || null,
    parentEmail: String(formData.get("parentEmail") || "") || null,
    parentPhone: String(formData.get("parentPhone") || "") || null,
  });
  redirect(`/divers/${r.diverId}`);
}
