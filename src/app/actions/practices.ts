"use server";

import { db, tables } from "@/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/server/session";
import { recordAudit } from "@/lib/server/audit";
import { sendTemplatedEmail } from "@/lib/server/notify";
import { syncPracticeCharges } from "@/lib/server/charge-sync";
import {
  addDaysYMD, localToUtc, ymdDayOfWeek, formatLocalDate, formatLocalTime, type YMD,
} from "@/lib/dates";

function parseIds(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(Boolean);
}

/** Create a weekly recurring series and materialize each occurrence. */
export async function createPracticeSeries(formData: FormData) {
  const session = await requireCoach();
  const title = String(formData.get("title") || "Practice").trim();
  const facilityId = String(formData.get("facilityId") || "") || null;
  const category = String(formData.get("category") || "weekday") as "weekday" | "sunday" | "clinic" | "non_billable";
  const startTime = String(formData.get("startTime") || "17:30");
  const endTime = String(formData.get("endTime") || "19:30");
  const rangeStart = String(formData.get("rangeStart")) as YMD;
  const rangeEnd = String(formData.get("rangeEnd")) as YMD;
  const weekdays = formData.getAll("weekdays").map((v) => Number(v));
  const eligibleGroupIds = parseIds(formData, "groupIds");
  const notes = String(formData.get("notes") || "") || null;

  if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) throw new Error("Check the date range.");
  if (weekdays.length === 0) throw new Error("Pick at least one weekday.");
  // Cap expansion at ~1 year of daily practices for safety.
  const spanDays = Math.round((Date.parse(rangeEnd) - Date.parse(rangeStart)) / 86400000);
  if (spanDays > 400) throw new Error("Series can span at most 400 days. Create another series for the next season.");

  let firstId = "";
  await db.transaction(async (tx) => {
    const [series] = await tx.insert(tables.practiceSeries).values({
      clubId: session.clubId, title, facilityId, weekdays, startTime, endTime,
      rangeStart, rangeEnd, category, eligibleGroupIds, notes,
    }).returning();

    let count = 0;
    for (let d = rangeStart; d <= rangeEnd; d = addDaysYMD(d, 1)) {
      if (!weekdays.includes(ymdDayOfWeek(d))) continue;
      // Sunday occurrences of a weekday-priced series stay category=weekday unless
      // the series itself is a Sunday series; coaches set Sunday series separately
      // so Sunday pricing is explicit, not inferred.
      const [p] = await tx.insert(tables.practices).values({
        clubId: session.clubId,
        seriesId: series.id,
        title,
        practiceDate: d,
        startsAt: localToUtc(d, startTime),
        endsAt: localToUtc(d, endTime),
        facilityId,
        category,
        eligibleGroupIds,
        internalNotes: notes,
      }).returning({ id: tables.practices.id });
      if (!firstId) firstId = p.id;
      count++;
    }

    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "practice.series.create", entityType: "practice_series", entityId: series.id,
      summary: `Created series "${title}" (${count} practices, ${rangeStart} → ${rangeEnd})`,
    });
  });

  revalidatePath("/calendar");
  redirect("/calendar");
}

export async function createOneOffPractice(formData: FormData) {
  const session = await requireCoach();
  const title = String(formData.get("title") || "Practice").trim();
  const date = String(formData.get("date")) as YMD;
  const startTime = String(formData.get("startTime") || "17:30");
  const endTime = String(formData.get("endTime") || "19:30");
  const facilityId = String(formData.get("facilityId") || "") || null;
  const category = String(formData.get("category") || "weekday") as "weekday" | "sunday" | "clinic" | "non_billable";
  const eligibleGroupIds = parseIds(formData, "groupIds");
  const capacity = formData.get("capacity") ? Number(formData.get("capacity")) : null;
  const publicDescription = String(formData.get("publicDescription") || "") || null;

  let id = "";
  await db.transaction(async (tx) => {
    const [p] = await tx.insert(tables.practices).values({
      clubId: session.clubId, title, practiceDate: date,
      startsAt: localToUtc(date, startTime), endsAt: localToUtc(date, endTime),
      facilityId, category, eligibleGroupIds, capacity, publicDescription,
    }).returning();
    id = p.id;
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "practice.create", entityType: "practice", entityId: p.id,
      summary: `Created ${category} "${title}" on ${date}`,
    });
  });
  revalidatePath("/calendar");
  redirect(`/practices/${id}`);
}

/** Edit one practice, or this-and-future / all within its series. */
export async function updatePractice(formData: FormData) {
  const session = await requireCoach();
  const practiceId = String(formData.get("practiceId"));
  const scope = String(formData.get("scope") || "one"); // one | future | all
  const title = String(formData.get("title") || "").trim();
  const date = String(formData.get("date")) as YMD;
  const startTime = String(formData.get("startTime"));
  const endTime = String(formData.get("endTime"));
  const facilityId = String(formData.get("facilityId") || "") || null;
  const category = String(formData.get("category")) as "weekday" | "sunday" | "clinic" | "non_billable";
  const notifyFamilies = formData.get("notify") === "on";
  const changeSummary = String(formData.get("changeSummary") || "").trim();

  const practice = await db.query.practices.findFirst({
    where: and(eq(tables.practices.id, practiceId), eq(tables.practices.clubId, session.clubId)),
  });
  if (!practice) throw new Error("Practice not found.");

  const targets = scope === "one" || !practice.seriesId
    ? [practice]
    : await db.query.practices.findMany({
        where: and(
          eq(tables.practices.seriesId, practice.seriesId),
          eq(tables.practices.clubId, session.clubId),
          ...(scope === "future" ? [gte(tables.practices.practiceDate, practice.practiceDate)] : []),
        ),
      });

  await db.transaction(async (tx) => {
    for (const t of targets) {
      // Date change only applies to the single practice being edited.
      const newDate = t.id === practice.id ? date : (t.practiceDate as YMD);
      await tx.update(tables.practices).set({
        title: title || t.title,
        practiceDate: newDate,
        startsAt: localToUtc(newDate, startTime),
        endsAt: localToUtc(newDate, endTime),
        facilityId,
        category,
        status: t.status === "canceled" ? "canceled" : "changed",
      }).where(eq(tables.practices.id, t.id));
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "practice.update", entityType: "practice", entityId: practiceId,
      summary: `Updated ${targets.length} practice${targets.length === 1 ? "" : "s"} (${scope})${changeSummary ? `: ${changeSummary}` : ""}`,
    });
  });

  // Category changes can affect billing — resync charges for affected practices.
  for (const t of targets) await syncPracticeCharges(t.id, session.userId);

  if (notifyFamilies) {
    await notifyPracticeFamilies(session.clubId, practiceId, "practice_changed", changeSummary || "Please check the updated details.");
  }

  revalidatePath("/calendar");
  revalidatePath(`/practices/${practiceId}`);
  redirect(`/practices/${practiceId}`);
}

export async function cancelPractice(formData: FormData) {
  const session = await requireCoach();
  const practiceId = String(formData.get("practiceId"));
  const scope = String(formData.get("scope") || "one");
  const notifyFamilies = formData.get("notify") === "on";
  const reason = String(formData.get("reason") || "").trim();

  const practice = await db.query.practices.findFirst({
    where: and(eq(tables.practices.id, practiceId), eq(tables.practices.clubId, session.clubId)),
  });
  if (!practice) throw new Error("Practice not found.");

  const targets = scope === "one" || !practice.seriesId
    ? [practice]
    : await db.query.practices.findMany({
        where: and(
          eq(tables.practices.seriesId, practice.seriesId),
          eq(tables.practices.clubId, session.clubId),
          ...(scope === "future" ? [gte(tables.practices.practiceDate, practice.practiceDate)] : []),
        ),
      });

  await db.transaction(async (tx) => {
    await tx.update(tables.practices).set({ status: "canceled" })
      .where(inArray(tables.practices.id, targets.map((t) => t.id)));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "practice.cancel", entityType: "practice", entityId: practiceId,
      summary: `Canceled ${targets.length} practice${targets.length === 1 ? "" : "s"}${reason ? `: ${reason}` : ""}`,
    });
  });

  // Cancellation voids/reverses any attendance charges on those practices.
  for (const t of targets) await syncPracticeCharges(t.id, session.userId);

  if (notifyFamilies) {
    for (const t of targets) {
      await notifyPracticeFamilies(session.clubId, t.id, "practice_canceled", reason || "We're sorry for the change of plans.");
    }
  }

  revalidatePath("/calendar");
  revalidatePath(`/practices/${practiceId}`);
  redirect("/calendar");
}

export async function restorePractice(formData: FormData) {
  const session = await requireCoach();
  const practiceId = String(formData.get("practiceId"));
  await db.transaction(async (tx) => {
    await tx.update(tables.practices).set({ status: "changed" })
      .where(and(eq(tables.practices.id, practiceId), eq(tables.practices.clubId, session.clubId)));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "practice.restore", entityType: "practice", entityId: practiceId,
      summary: "Restored canceled practice",
    });
  });
  await syncPracticeCharges(practiceId, session.userId);
  revalidatePath(`/practices/${practiceId}`);
  revalidatePath("/calendar");
}

/** Email primary guardians of divers in the practice's eligible groups. */
async function notifyPracticeFamilies(clubId: string, practiceId: string, eventType: string, changeSummary: string) {
  const practice = await db.query.practices.findFirst({
    where: eq(tables.practices.id, practiceId),
    with: { facility: true },
  });
  if (!practice) return;
  const groupIds = (practice.eligibleGroupIds as string[]) ?? [];
  const clubDivers = await db.query.divers.findMany({
    where: and(eq(tables.divers.clubId, clubId), eq(tables.divers.status, "active")),
    with: { family: { with: { guardians: true } } },
  });
  const affected = groupIds.length === 0
    ? clubDivers
    : clubDivers.filter((d) => d.primaryGroupId && groupIds.includes(d.primaryGroupId));

  const seen = new Set<string>();
  for (const diver of affected) {
    const primary = diver.family.guardians.find((g) => g.isPrimary && g.email) ?? diver.family.guardians.find((g) => g.email);
    if (!primary?.email || seen.has(primary.email)) continue;
    seen.add(primary.email);
    await sendTemplatedEmail({
      clubId,
      eventType,
      recipientEmail: primary.email,
      fields: {
        guardian_name: primary.name,
        practice_title: practice.title,
        practice_date: formatLocalDate(practice.practiceDate as YMD),
        practice_time: `${formatLocalTime(practice.startsAt)}–${formatLocalTime(practice.endsAt)}`,
        facility: practice.facility?.name ?? "TBD",
        change_summary: changeSummary,
      },
      idempotencyKey: `${eventType}:${practiceId}:${primary.email}`,
    });
  }
}
