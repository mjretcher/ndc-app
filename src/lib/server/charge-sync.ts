import "server-only";
import { db, tables } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  computeAttendanceCharge, computeMonthlyPlanCharge, resolvePlanAssignment,
  type RateRow, type PlanAssignmentRow, type PracticeCategory,
} from "@/lib/billing-engine";
import type { YMD } from "@/lib/dates";

/**
 * Reconcile the draft charge for one attendance record so the stored charge
 * always matches what the engine says SHOULD exist.
 *
 * Idempotency: the charge row is keyed by (source_type='attendance',
 * source_id=attendanceId) under a unique index. Resubmitting corrected
 * attendance updates that one row; it can never create a duplicate.
 *
 * Immutability: once a charge is invoiced, it is never rewritten. Any
 * divergence is recorded as a separate `adjustment` charge (positive or
 * negative) in the current draft pool.
 */
export async function syncAttendanceCharge(attendanceId: string, actorUserId: string | null) {
  await db.transaction(async (tx) => {
    const att = await tx.query.attendanceRecords.findFirst({
      where: eq(tables.attendanceRecords.id, attendanceId),
      with: {
        practice: { with: { facility: true } },
        diver: { with: { family: true, primaryGroup: true, planAssignments: { with: { plan: true } } } },
      },
    });
    if (!att) return;
    const practice = att.practice;
    const diver = att.diver;
    const serviceDate = practice.practiceDate as YMD;

    const rateRows = await tx.query.rateSchedules.findMany({
      where: eq(tables.rateSchedules.clubId, practice.clubId),
    });
    const rates: RateRow[] = rateRows.map((r) => ({
      id: r.id, groupId: r.groupId, category: r.category as PracticeCategory,
      amountCents: r.amountCents, effectiveStart: r.effectiveStart as YMD,
      effectiveEnd: (r.effectiveEnd as YMD) ?? null, priority: r.priority,
    }));
    const assignments: PlanAssignmentRow[] = diver.planAssignments.map((a) => ({
      id: a.id, planId: a.planId, effectiveStart: a.effectiveStart as YMD,
      effectiveEnd: (a.effectiveEnd as YMD) ?? null,
      overrideAmountCents: a.overrideAmountCents,
      plan: {
        id: a.plan.id, name: a.plan.name, planType: a.plan.planType,
        amountCents: a.plan.amountCents,
        installmentMonths: (a.plan.installmentMonths as number[]) ?? null,
        installmentTotalCents: a.plan.installmentTotalCents,
      },
    }));

    const desired = computeAttendanceCharge({
      attendanceId: att.id,
      diverId: diver.id,
      familyId: diver.familyId,
      diverName: diver.preferredName || diver.legalName,
      groupId: diver.primaryGroupId,
      groupName: diver.primaryGroup?.name ?? null,
      status: att.status,
      billable: att.billable,
      practice: {
        id: practice.id,
        date: serviceDate,
        title: practice.title,
        facilityName: practice.facility?.name ?? null,
        category: practice.category as PracticeCategory,
        status: practice.status,
      },
      planAssignment: resolvePlanAssignment(assignments, serviceDate),
      rates,
    });

    const existing = await tx.query.charges.findFirst({
      where: and(eq(tables.charges.sourceType, "attendance"), eq(tables.charges.sourceId, att.id)),
    });

    if (desired.kind === "none" && (desired.reason === "missing rate" || desired.reason === "no billing plan assigned")) {
      // Billable attendance with no resolvable rate OR no plan effective on the
      // practice date: store a $0 marker charge flagged needsAttention so the
      // billing review catches it instead of silently under-billing. When a
      // rate/plan is added and sync reruns, this row gets the real amount.
      const problem = desired.reason === "missing rate"
        ? `no ${practice.category} rate exists for their group`
        : "no billing plan was in effect on that date";
      const marker = {
        clubId: practice.clubId,
        familyId: diver.familyId,
        diverId: diver.id,
        sourceType: "attendance" as const,
        sourceId: att.id,
        serviceDate,
        description: `NEEDS REVIEW — ${diver.preferredName || diver.legalName} attended ${practice.title} on ${serviceDate} but ${problem}`,
        amountCents: 0,
        status: "draft" as const,
        needsAttention: true,
        createdByUserId: actorUserId,
      };
      if (!existing) {
        await tx.insert(tables.charges).values(marker).onConflictDoNothing();
      } else if (existing.status !== "invoiced") {
        await tx.update(tables.charges).set({
          description: marker.description, amountCents: 0, status: "draft",
          needsAttention: true, updatedAt: new Date(),
        }).where(eq(tables.charges.id, existing.id));
      }
      return;
    }

    if (desired.kind === "none") {
      if (!existing) return;
      if (existing.status === "invoiced") {
        // Reverse via adjustment credit in the draft pool.
        await tx.insert(tables.charges).values({
          clubId: practice.clubId,
          familyId: existing.familyId,
          diverId: existing.diverId,
          sourceType: "adjustment",
          sourceId: `adj:${existing.id}:${Date.now()}`,
          serviceDate: existing.serviceDate,
          description: `Adjustment — reversal of invoiced charge: ${existing.description} (${desired.reason})`,
          amountCents: -existing.amountCents,
          status: "draft",
          createdByUserId: actorUserId,
        });
      } else if (existing.status !== "voided") {
        await tx.update(tables.charges)
          .set({ status: "voided", waiveReason: desired.reason, updatedAt: new Date() })
          .where(eq(tables.charges.id, existing.id));
      }
      return;
    }

    // desired.kind === "charge"
    if (!existing) {
      await tx.insert(tables.charges).values({
        clubId: practice.clubId,
        familyId: desired.familyId,
        diverId: desired.diverId,
        sourceType: "attendance",
        sourceId: desired.sourceId,
        serviceDate: desired.serviceDate,
        description: desired.description,
        amountCents: desired.amountCents,
        status: "draft",
        rateSnapshot: desired.rateSnapshot,
        createdByUserId: actorUserId,
      }).onConflictDoNothing();
      return;
    }
    if (existing.status === "invoiced") {
      const delta = desired.amountCents - existing.amountCents;
      if (delta !== 0) {
        await tx.insert(tables.charges).values({
          clubId: practice.clubId,
          familyId: desired.familyId,
          diverId: desired.diverId,
          sourceType: "adjustment",
          sourceId: `adj:${existing.id}:${Date.now()}`,
          serviceDate: desired.serviceDate,
          description: `Adjustment — corrected invoiced charge: ${desired.description}`,
          amountCents: delta,
          status: "draft",
          createdByUserId: actorUserId,
        });
      }
      return;
    }
    // Draft/reviewed/waived/voided drafts are safely rewritable.
    await tx.update(tables.charges).set({
      familyId: desired.familyId,
      diverId: desired.diverId,
      serviceDate: desired.serviceDate,
      description: desired.description,
      amountCents: desired.amountCents,
      status: "draft",
      needsAttention: false,
      waiveReason: null,
      rateSnapshot: desired.rateSnapshot,
      updatedAt: new Date(),
    }).where(eq(tables.charges.id, existing.id));
  });
}

/** Sync every attendance record on a practice (used after cancel/restore). */
export async function syncPracticeCharges(practiceId: string, actorUserId: string | null) {
  const records = await db.query.attendanceRecords.findMany({
    where: eq(tables.attendanceRecords.practiceId, practiceId),
    columns: { id: true },
  });
  for (const r of records) await syncAttendanceCharge(r.id, actorUserId);
}

/**
 * Generate flat-monthly and seasonal-installment charges for a billing cycle.
 * Idempotent per (planAssignmentId, YYYY-MM). Returns count created.
 */
export async function generateMonthlyCharges(clubId: string, year: number, month: number, actorUserId: string | null): Promise<number> {
  const activeDivers = await db.query.divers.findMany({
    where: and(eq(tables.divers.clubId, clubId), inArray(tables.divers.status, ["active"])),
    with: { planAssignments: { with: { plan: true } } },
  });
  let created = 0;
  for (const diver of activeDivers) {
    for (const a of diver.planAssignments) {
      const pa: PlanAssignmentRow = {
        id: a.id, planId: a.planId, effectiveStart: a.effectiveStart as YMD,
        effectiveEnd: (a.effectiveEnd as YMD) ?? null,
        overrideAmountCents: a.overrideAmountCents,
        plan: {
          id: a.plan.id, name: a.plan.name, planType: a.plan.planType,
          amountCents: a.plan.amountCents,
          installmentMonths: (a.plan.installmentMonths as number[]) ?? null,
          installmentTotalCents: a.plan.installmentTotalCents,
        },
      };
      const desired = computeMonthlyPlanCharge({
        diverId: diver.id, familyId: diver.familyId,
        diverName: diver.preferredName || diver.legalName,
        cycleYear: year, cycleMonth: month, planAssignment: pa,
      });
      if (!desired) continue;
      const res = await db.insert(tables.charges).values({
        clubId,
        familyId: desired.familyId,
        diverId: desired.diverId,
        sourceType: desired.sourceType,
        sourceId: desired.sourceId,
        serviceDate: desired.serviceDate,
        description: desired.description,
        amountCents: desired.amountCents,
        status: "draft",
        rateSnapshot: desired.rateSnapshot,
        createdByUserId: actorUserId,
      }).onConflictDoNothing().returning({ id: tables.charges.id });
      if (res.length > 0) created++;
    }
  }
  return created;
}
