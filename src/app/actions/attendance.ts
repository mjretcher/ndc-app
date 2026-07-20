"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/server/session";
import { syncAttendanceCharge } from "@/lib/server/charge-sync";

type AttendanceStatus = "unmarked" | "present" | "absent" | "excused" | "trial";

/**
 * Set (or create) an attendance record for a diver at a practice, log the
 * change, and immediately reconcile the derived charge. Attendance is always
 * editable — the charge layer handles invoiced-period corrections as
 * adjustments, so coaches never need to think about billing state here.
 */
export async function setAttendance(input: {
  practiceId: string;
  diverId: string;
  status: AttendanceStatus;
  billable?: boolean;
  reason?: string;
}) {
  const session = await requireCoach();

  const practice = await db.query.practices.findFirst({
    where: and(eq(tables.practices.id, input.practiceId), eq(tables.practices.clubId, session.clubId)),
  });
  if (!practice) throw new Error("Practice not found.");

  // Trial defaults to non-billable; everything else defaults billable unless
  // the coach explicitly waives.
  const billable = input.billable ?? (input.status !== "trial");

  const attendanceId = await db.transaction(async (tx) => {
    const existing = await tx.query.attendanceRecords.findFirst({
      where: and(
        eq(tables.attendanceRecords.practiceId, input.practiceId),
        eq(tables.attendanceRecords.diverId, input.diverId),
      ),
    });

    let id: string;
    if (existing) {
      await tx.update(tables.attendanceRecords).set({
        status: input.status,
        billable,
        billableOverrideReason: input.reason ?? existing.billableOverrideReason,
        recordedByUserId: session.userId,
        recordedAt: new Date(),
      }).where(eq(tables.attendanceRecords.id, existing.id));
      id = existing.id;
      await tx.insert(tables.attendanceChangeLog).values({
        attendanceId: id,
        priorStatus: existing.status,
        newStatus: input.status,
        priorBillable: existing.billable,
        newBillable: billable,
        reason: input.reason ?? null,
        changedByUserId: session.userId,
      });
    } else {
      const [row] = await tx.insert(tables.attendanceRecords).values({
        practiceId: input.practiceId,
        diverId: input.diverId,
        status: input.status,
        billable,
        billableOverrideReason: input.reason ?? null,
        recordedByUserId: session.userId,
      }).returning({ id: tables.attendanceRecords.id });
      id = row.id;
      await tx.insert(tables.attendanceChangeLog).values({
        attendanceId: id,
        priorStatus: null,
        newStatus: input.status,
        priorBillable: null,
        newBillable: billable,
        reason: input.reason ?? null,
        changedByUserId: session.userId,
      });
    }
    return id;
  });

  await syncAttendanceCharge(attendanceId, session.userId);
  revalidatePath(`/practices/${input.practiceId}/attendance`);
  return { ok: true as const };
}

/** Mark every currently-unmarked roster diver absent (end-of-practice sweep). */
export async function markRemainingAbsent(input: { practiceId: string; diverIds: string[] }) {
  for (const diverId of input.diverIds) {
    await setAttendance({ practiceId: input.practiceId, diverId, status: "absent" });
  }
  return { ok: true as const };
}
