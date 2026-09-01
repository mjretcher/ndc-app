"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/server/session";
import type { YMD } from "@/lib/dates";

/** A coach may only edit their own availability, unless they're owner/admin. */
async function resolveTargetUserId(formData: FormData): Promise<string> {
  const session = await requireCoach();
  const requested = String(formData.get("userId") || "");
  if (requested && requested !== session.userId && session.role !== "owner_admin") {
    throw new Error("You can only edit your own availability.");
  }
  return requested || session.userId;
}

/** Set (or clear) the weekly pattern for one weekday. */
export async function setWeeklyAvailability(formData: FormData) {
  const userId = await resolveTargetUserId(formData);
  const weekday = Number(formData.get("weekday"));
  const value = String(formData.get("available")); // "true" | "false" | "clear"

  if (value === "clear") {
    await db.delete(tables.coachWeeklyAvailability).where(
      and(eq(tables.coachWeeklyAvailability.userId, userId), eq(tables.coachWeeklyAvailability.weekday, weekday)),
    );
  } else {
    const available = value === "true";
    const existing = await db.query.coachWeeklyAvailability.findFirst({
      where: and(eq(tables.coachWeeklyAvailability.userId, userId), eq(tables.coachWeeklyAvailability.weekday, weekday)),
    });
    if (existing) {
      await db.update(tables.coachWeeklyAvailability).set({ available, updatedAt: new Date() })
        .where(eq(tables.coachWeeklyAvailability.id, existing.id));
    } else {
      await db.insert(tables.coachWeeklyAvailability).values({ userId, weekday, available });
    }
  }
  revalidatePath("/availability");
}

/** Add or update a one-off exception for a specific date. */
export async function setAvailabilityException(formData: FormData) {
  const userId = await resolveTargetUserId(formData);
  const date = String(formData.get("date")) as YMD;
  const available = String(formData.get("available")) === "true";
  const note = String(formData.get("note") || "") || null;
  if (!date) throw new Error("Pick a date.");

  const existing = await db.query.coachAvailabilityExceptions.findFirst({
    where: and(eq(tables.coachAvailabilityExceptions.userId, userId), eq(tables.coachAvailabilityExceptions.date, date)),
  });
  if (existing) {
    await db.update(tables.coachAvailabilityExceptions).set({ available, note })
      .where(eq(tables.coachAvailabilityExceptions.id, existing.id));
  } else {
    await db.insert(tables.coachAvailabilityExceptions).values({ userId, date, available, note });
  }
  revalidatePath("/availability");
}

export async function removeAvailabilityException(formData: FormData) {
  const userId = await resolveTargetUserId(formData);
  const exceptionId = String(formData.get("exceptionId"));
  await db.delete(tables.coachAvailabilityExceptions).where(
    and(eq(tables.coachAvailabilityExceptions.id, exceptionId), eq(tables.coachAvailabilityExceptions.userId, userId)),
  );
  revalidatePath("/availability");
}
