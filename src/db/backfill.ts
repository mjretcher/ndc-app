/* Backfill Apr 29 – Jul 16, 2026 practices, attendance, and draft charges.
 * Idempotent: safe to re-run. Uses the app's own computeAttendanceCharge. */
import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import * as t from "./schema";
import { computeAttendanceCharge, type RateRow, type PlanAssignmentRow } from "../lib/billing-engine";
import type { YMD } from "../lib/dates";

neonConfig.fetchEndpoint = (host: string) => `https://${host}/sql`;
const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client, { schema: t });

// ---- Static data -----------------------------------------------------------
// group slugs: intermediate-brown = $20 weekday, beginner-orange = $15 weekday
const ATHLETES: Record<string, { group: string }> = {
  Trevor:   { group: "intermediate-brown" },
  Danielle: { group: "intermediate-brown" },
  Devin:    { group: "intermediate-brown" },
  Amelia:   { group: "intermediate-brown" },
  Laney:    { group: "beginner-orange" },
  Elina:    { group: "beginner-orange" },
  Joy:      { group: "lesson" }, // trial only, never billed
};

// [date, start, end, athletes]; times are America/New_York (EDT, UTC-4 all season)
const SESSIONS: [YMD, string, string, string[]][] = [
  ["2026-04-29", "17:00", "19:15", ["Joy", "Trevor", "Devin"]],
  ["2026-05-14", "17:00", "17:40", ["Trevor"]],
  ["2026-05-19", "17:00", "18:30", ["Trevor", "Danielle"]],
  ["2026-05-20", "17:00", "18:40", ["Trevor", "Danielle"]],
  ["2026-05-26", "17:15", "18:30", ["Trevor"]],
  ["2026-05-28", "17:15", "18:45", ["Danielle", "Laney"]],
  ["2026-06-03", "17:15", "18:40", ["Danielle", "Amelia", "Laney"]],
  ["2026-06-08", "17:15", "18:40", ["Danielle", "Laney", "Trevor", "Devin"]],
  ["2026-06-10", "17:15", "18:40", ["Danielle", "Trevor", "Laney", "Amelia"]],
  ["2026-06-15", "17:15", "18:40", ["Danielle", "Laney", "Devin"]],
  ["2026-06-17", "17:30", "19:00", ["Danielle", "Laney", "Amelia", "Trevor", "Devin"]],
  ["2026-06-18", "17:15", "18:45", ["Danielle", "Amelia"]],
  ["2026-06-22", "17:15", "18:45", ["Danielle", "Amelia", "Trevor"]],
  ["2026-06-24", "17:15", "18:45", ["Trevor", "Laney", "Devin", "Elina"]],
  ["2026-06-25", "18:00", "18:45", ["Danielle", "Laney"]],
  ["2026-07-06", "17:15", "18:45", ["Laney", "Elina", "Trevor"]],
  ["2026-07-08", "17:15", "18:45", ["Elina", "Laney", "Amelia", "Danielle"]],
  ["2026-07-09", "08:00", "08:30", ["Trevor"]],
  ["2026-07-09", "17:15", "18:45", ["Laney", "Amelia", "Devin"]],
  ["2026-07-13", "17:15", "18:45", ["Trevor", "Elina"]],
  ["2026-07-15", "17:15", "18:45", ["Trevor", "Elina", "Laney", "Amelia"]],
  ["2026-07-16", "17:15", "18:45", ["Trevor", "Laney", "Devin"]],
];

const EDT_OFFSET = "-04:00"; // all dates fall inside daylight saving time

async function main() {
  const club = await db.query.clubs.findFirst({ where: eq(t.clubs.name, "Napoleon Diving Club") });
  if (!club) throw new Error("club not found");
  const clubId = club.id;

  const admin = await db.query.users.findFirst({ where: eq(t.users.email, "napoleondivingclub@gmail.com") });
  if (!admin) throw new Error("admin not found");

  const groups = await db.query.groups.findMany({ where: eq(t.groups.clubId, clubId) });
  const groupBySlug = Object.fromEntries(groups.map((g) => [g.slug, g]));

  const perPracticePlan = await db.query.billingPlans.findFirst({
    where: and(eq(t.billingPlans.clubId, clubId), eq(t.billingPlans.planType, "per_practice")),
  });
  if (!perPracticePlan) throw new Error("per-practice plan not found");

  const bgsu = await db.query.facilities.findFirst({
    where: and(eq(t.facilities.clubId, clubId), eq(t.facilities.name, "Bowling Green State University")),
  });
  if (!bgsu) throw new Error("BGSU facility not found");

  const rateRows = await db.query.rateSchedules.findMany({ where: eq(t.rateSchedules.clubId, clubId) });
  const rates: RateRow[] = rateRows.map((r) => ({
    id: r.id, groupId: r.groupId, category: r.category,
    amountCents: r.amountCents, effectiveStart: r.effectiveStart as YMD,
    effectiveEnd: (r.effectiveEnd as YMD) ?? null, priority: r.priority,
  }));

  // ---- Natalia: assistant-coach user account (placeholder email) ----------
  const nataliaEmail = "natalia-mayorga@placeholder.ndc.example";
  let natalia = await db.query.users.findFirst({ where: eq(t.users.email, nataliaEmail) });
  if (!natalia) {
    [natalia] = await db.insert(t.users).values({
      email: nataliaEmail, name: "Natalia Mayorga",
      passwordHash: await bcrypt.hash(process.env.NATALIA_PASSWORD ?? "change-me-natalia", 10),
    }).returning();
    await db.insert(t.clubMemberships).values({ clubId, userId: natalia.id, role: "coach" });
    console.log("Created coach Natalia Mayorga (placeholder email — update in Settings → Coaches)");
  }

  // ---- Families + divers + plan assignments --------------------------------
  const diverByName: Record<string, typeof t.divers.$inferSelect> = {};
  for (const [name, cfg] of Object.entries(ATHLETES)) {
    let diver = await db.query.divers.findFirst({
      where: and(eq(t.divers.clubId, clubId), eq(t.divers.legalName, name)),
    });
    if (!diver) {
      const [family] = await db.insert(t.families).values({
        clubId,
        billingName: `${name} — Family (placeholder, update billing name)`,
        notes: "Backfilled 2026-07-20 from coach practice log. Guardian details are placeholders.",
      }).returning();
      await db.insert(t.guardians).values({
        familyId: family.id,
        name: `Guardian of ${name} (placeholder)`,
        email: `${name.toLowerCase()}-family@placeholder.ndc.example`,
        isPrimary: true, isEmergencyContact: true,
      });
      [diver] = await db.insert(t.divers).values({
        clubId, familyId: family.id, legalName: name,
        status: "active", startDate: "2026-04-29",
        primaryGroupId: groupBySlug[cfg.group].id,
      }).returning();
      if (name !== "Joy") {
        await db.insert(t.diverPlanAssignments).values({
          diverId: diver.id, planId: perPracticePlan.id, effectiveStart: "2026-04-01",
          notes: "Backfilled: per-practice billing per coach instruction",
        });
      }
      console.log(`Created ${name} (${cfg.group})${name === "Joy" ? " — no billing plan (trial only)" : ""}`);
    }
    diverByName[name] = diver;
  }

  // Plan assignments cache
  const paByDiver: Record<string, PlanAssignmentRow[]> = {};
  for (const [name, diver] of Object.entries(diverByName)) {
    const pas = await db.query.diverPlanAssignments.findMany({ where: eq(t.diverPlanAssignments.diverId, diver.id) });
    paByDiver[name] = pas.map((pa) => ({
      id: pa.id, planId: pa.planId, effectiveStart: pa.effectiveStart as YMD,
      effectiveEnd: (pa.effectiveEnd as YMD) ?? null, overrideAmountCents: pa.overrideAmountCents,
      plan: {
        id: perPracticePlan.id, name: perPracticePlan.name, planType: perPracticePlan.planType,
        amountCents: perPracticePlan.amountCents,
        installmentMonths: perPracticePlan.installmentMonths as number[] | null,
        installmentTotalCents: perPracticePlan.installmentTotalCents,
      },
    }));
  }

  // ---- Practices, coach assignment, attendance, charges --------------------
  let chargeTotal = 0, chargeCount = 0;
  for (const [date, start, end, names] of SESSIONS) {
    const startsAt = new Date(`${date}T${start}:00${EDT_OFFSET}`);
    const endsAt = new Date(`${date}T${end}:00${EDT_OFFSET}`);
    const title = start === "08:00" ? "Morning Practice — BGSU" : "Practice — BGSU";

    let practice = (await db.query.practices.findMany({
      where: and(eq(t.practices.clubId, clubId), eq(t.practices.practiceDate, date)),
    })).find((p) => p.startsAt.getTime() === startsAt.getTime());
    if (!practice) {
      [practice] = await db.insert(t.practices).values({
        clubId, title, startsAt, endsAt, practiceDate: date,
        facilityId: bgsu.id, category: "weekday", eligibleGroupIds: [],
        status: "completed", internalNotes: "Backfilled from coach practice log 2026-07-20",
      }).returning();
    }
    // Natalia was head coach for all sessions
    const pc = await db.query.practiceCoaches.findFirst({
      where: and(eq(t.practiceCoaches.practiceId, practice.id), eq(t.practiceCoaches.userId, natalia.id)),
    });
    if (!pc) await db.insert(t.practiceCoaches).values({ practiceId: practice.id, userId: natalia.id });

    for (const name of names) {
      const diver = diverByName[name];
      const isTrial = name === "Joy";
      let att = await db.query.attendanceRecords.findFirst({
        where: and(eq(t.attendanceRecords.practiceId, practice.id), eq(t.attendanceRecords.diverId, diver.id)),
      });
      if (!att) {
        [att] = await db.insert(t.attendanceRecords).values({
          practiceId: practice.id, diverId: diver.id,
          status: isTrial ? "trial" : "present",
          billable: !isTrial,
          notes: isTrial ? "Not billed per coach decision" : null,
          recordedByUserId: admin.id,
        }).returning();
      }

      const group = groups.find((g) => g.id === diver.primaryGroupId)!;
      const desired = computeAttendanceCharge({
        attendanceId: att.id, diverId: diver.id, familyId: diver.familyId,
        diverName: name, groupId: group.id, groupName: group.name,
        status: att.status, billable: att.billable,
        practice: {
          id: practice.id, date, title: practice.title,
          facilityName: "Bowling Green State University",
          category: practice.category, status: practice.status,
        },
        planAssignment: paByDiver[name].length
          ? paByDiver[name].find((pa) => pa.effectiveStart <= date && (pa.effectiveEnd === null || pa.effectiveEnd >= date)) ?? null
          : null,
        rates,
      });

      if (desired.kind === "charge") {
        const existing = await db.query.charges.findFirst({
          where: and(eq(t.charges.sourceType, "attendance"), eq(t.charges.sourceId, desired.sourceId)),
        });
        if (!existing) {
          await db.insert(t.charges).values({
            clubId, familyId: desired.familyId, diverId: desired.diverId,
            sourceType: desired.sourceType, sourceId: desired.sourceId,
            serviceDate: desired.serviceDate, description: desired.description,
            amountCents: desired.amountCents, status: "draft",
            rateSnapshot: desired.rateSnapshot, createdByUserId: admin.id,
          });
        }
        chargeTotal += desired.amountCents; chargeCount++;
      }
    }
  }
  console.log(`Done. ${SESSIONS.length} practices, ${chargeCount} billable charges, total $${(chargeTotal / 100).toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
