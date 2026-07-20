/**
 * Integration smoke test against the dev database.
 * Run: npx tsx scripts/smoke-charges.ts
 * Creates a throwaway family/diver/practice, drives the charge-sync pipeline,
 * asserts idempotency + missing-rate markers, then cleans up.
 */
import { db, tables } from "../src/db";
import { and, eq } from "drizzle-orm";
import { syncAttendanceCharge, generateMonthlyCharges } from "../src/lib/server/charge-sync";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
}

async function main() {
  const club = await db.query.clubs.findFirst();
  assert(club, "seeded club exists");
  const group = await db.query.groups.findFirst({ where: eq(tables.groups.slug, "intermediate-brown") });
  assert(group, "intermediate group exists");
  const perPractice = await db.query.billingPlans.findFirst({
    where: and(eq(tables.billingPlans.clubId, club.id), eq(tables.billingPlans.planType, "per_practice")),
  });
  assert(perPractice, "per-practice plan exists");
  const flatElite = await db.query.billingPlans.findFirst({
    where: and(eq(tables.billingPlans.clubId, club.id), eq(tables.billingPlans.planType, "flat_monthly"), eq(tables.billingPlans.name, "Elite / Navy Team monthly")),
  });

  // --- fixture ---
  const [family] = await db.insert(tables.families).values({
    clubId: club.id, billingName: "SMOKE Family",
  }).returning();
  const [diver] = await db.insert(tables.divers).values({
    clubId: club.id, familyId: family.id, legalName: "SMOKE Diver",
    birthDate: "2012-01-01", status: "active", startDate: "2026-01-01", primaryGroupId: group.id,
  }).returning();
  await db.insert(tables.diverPlanAssignments).values({
    diverId: diver.id, planId: perPractice.id, effectiveStart: "2026-01-01",
  });
  const [practice] = await db.insert(tables.practices).values({
    clubId: club.id, title: "SMOKE Sunday", practiceDate: "2026-07-12",
    startsAt: new Date("2026-07-12T14:00:00Z"), endsAt: new Date("2026-07-12T16:00:00Z"),
    category: "sunday", eligibleGroupIds: [group.id],
  }).returning();

  // --- present → Sunday intermediate rate ($25.00) ---
  const [att] = await db.insert(tables.attendanceRecords).values({
    practiceId: practice.id, diverId: diver.id, status: "present", billable: true,
  }).returning();
  await syncAttendanceCharge(att.id, null);
  let charge = await db.query.charges.findFirst({
    where: and(eq(tables.charges.sourceType, "attendance"), eq(tables.charges.sourceId, att.id)),
  });
  assert(charge && charge.amountCents === 2500, `sunday intermediate charge is $25 (got ${charge?.amountCents})`);
  assert(charge.status === "draft" && !charge.needsAttention, "charge is a clean draft");

  // --- resync is idempotent (same row, no duplicates) ---
  await syncAttendanceCharge(att.id, null);
  const all = await db.query.charges.findMany({
    where: and(eq(tables.charges.sourceType, "attendance"), eq(tables.charges.sourceId, att.id)),
  });
  assert(all.length === 1, `exactly one charge after resync (got ${all.length})`);

  // --- correction: absent → charge voided ---
  await db.update(tables.attendanceRecords).set({ status: "absent" }).where(eq(tables.attendanceRecords.id, att.id));
  await syncAttendanceCharge(att.id, null);
  charge = await db.query.charges.findFirst({ where: eq(tables.charges.id, all[0].id) });
  assert(charge?.status === "voided", `absent voids the charge (got ${charge?.status})`);

  // --- back to present → same row revived ---
  await db.update(tables.attendanceRecords).set({ status: "present" }).where(eq(tables.attendanceRecords.id, att.id));
  await syncAttendanceCharge(att.id, null);
  charge = await db.query.charges.findFirst({ where: eq(tables.charges.id, all[0].id) });
  assert(charge?.status === "draft" && charge.amountCents === 2500, "revived to $25 draft");

  // --- trial defaults non-billable → voided, no new rows ---
  await db.update(tables.attendanceRecords).set({ status: "trial", billable: false }).where(eq(tables.attendanceRecords.id, att.id));
  await syncAttendanceCharge(att.id, null);
  charge = await db.query.charges.findFirst({ where: eq(tables.charges.id, all[0].id) });
  assert(charge?.status === "voided", "trial (non-billable) voids");

  // --- missing rate → $0 needsAttention marker ---
  const [groupless] = await db.insert(tables.divers).values({
    clubId: club.id, familyId: family.id, legalName: "SMOKE NoGroup",
    birthDate: "2012-01-01", status: "active", startDate: "2026-01-01", primaryGroupId: null,
  }).returning();
  await db.insert(tables.diverPlanAssignments).values({
    diverId: groupless.id, planId: perPractice.id, effectiveStart: "2026-01-01",
  });
  const [att2] = await db.insert(tables.attendanceRecords).values({
    practiceId: practice.id, diverId: groupless.id, status: "present", billable: true,
  }).returning();
  await syncAttendanceCharge(att2.id, null);
  const marker = await db.query.charges.findFirst({
    where: and(eq(tables.charges.sourceType, "attendance"), eq(tables.charges.sourceId, att2.id)),
  });
  assert(marker && marker.amountCents === 0 && marker.needsAttention, "missing rate creates $0 needsAttention marker");

  // --- monthly generation: flat plan, idempotent ---
  if (flatElite) {
    const [flatDiver] = await db.insert(tables.divers).values({
      clubId: club.id, familyId: family.id, legalName: "SMOKE Flat",
      birthDate: "2010-01-01", status: "active", startDate: "2026-01-01",
    }).returning();
    await db.insert(tables.diverPlanAssignments).values({
      diverId: flatDiver.id, planId: flatElite.id, effectiveStart: "2026-01-01",
    });
    const n1 = await generateMonthlyCharges(club.id, 2026, 7, null);
    const n2 = await generateMonthlyCharges(club.id, 2026, 7, null);
    assert(n1 >= 1, `monthly generation created at least the flat charge (got ${n1})`);
    assert(n2 === 0, `second run creates nothing (got ${n2})`);
    const flatCharge = await db.query.charges.findFirst({
      where: and(eq(tables.charges.diverId, flatDiver.id), eq(tables.charges.sourceType, "flat_monthly")),
    });
    assert(flatCharge?.amountCents === 20000, `elite flat charge is $200 (got ${flatCharge?.amountCents})`);
  }

  // --- cleanup ---
  await db.delete(tables.charges).where(eq(tables.charges.familyId, family.id));
  await db.delete(tables.attendanceChangeLog).where(eq(tables.attendanceChangeLog.attendanceId, att.id));
  await db.delete(tables.attendanceChangeLog).where(eq(tables.attendanceChangeLog.attendanceId, att2.id));
  await db.delete(tables.attendanceRecords).where(eq(tables.attendanceRecords.practiceId, practice.id));
  await db.delete(tables.practices).where(eq(tables.practices.id, practice.id));
  const familyDivers = await db.query.divers.findMany({ where: eq(tables.divers.familyId, family.id) });
  for (const d of familyDivers) {
    await db.delete(tables.diverPlanAssignments).where(eq(tables.diverPlanAssignments.diverId, d.id));
  }
  await db.delete(tables.divers).where(eq(tables.divers.familyId, family.id));
  await db.delete(tables.families).where(eq(tables.families.id, family.id));

  console.log("SMOKE OK — attendance→charge pipeline verified");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
