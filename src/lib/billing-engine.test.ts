import { describe, it, expect } from "vitest";
import {
  resolveRate, resolvePlanAssignment, computeAttendanceCharge,
  computeMonthlyPlanCharge, computeInvoice,
  type RateRow, type PlanAssignmentRow, type AttendanceChargeInput,
} from "./billing-engine";
import { splitEvenCents, parseDollarsToCents, formatCents, percentOfCents } from "./money";
import { localToUtc, toLocalYMD, localDayOfWeek, ymdDayOfWeek } from "./dates";

const G_BEGINNER = "g-beginner";
const G_ELITE = "g-elite";

const rates: RateRow[] = [
  { id: "r1", groupId: G_BEGINNER, category: "weekday", amountCents: 1500, effectiveStart: "2026-01-01", effectiveEnd: null, priority: 0 },
  { id: "r2", groupId: G_BEGINNER, category: "sunday", amountCents: 1800, effectiveStart: "2026-01-01", effectiveEnd: null, priority: 0 },
  { id: "r3", groupId: G_ELITE, category: "weekday", amountCents: 2000, effectiveStart: "2026-01-01", effectiveEnd: null, priority: 0 },
  { id: "r4", groupId: G_ELITE, category: "sunday", amountCents: 2500, effectiveStart: "2026-01-01", effectiveEnd: null, priority: 0 },
  // future rate increase for beginner weekday
  { id: "r5", groupId: G_BEGINNER, category: "weekday", amountCents: 1700, effectiveStart: "2026-09-01", effectiveEnd: null, priority: 0 },
  // club-wide clinic fallback
  { id: "r6", groupId: null, category: "clinic", amountCents: 3000, effectiveStart: "2026-01-01", effectiveEnd: null, priority: 0 },
];

function perPracticePlan(id = "pa1"): PlanAssignmentRow {
  return {
    id, planId: "plan-pp", effectiveStart: "2026-01-01", effectiveEnd: null, overrideAmountCents: null,
    plan: { id: "plan-pp", name: "Per practice", planType: "per_practice", amountCents: null, installmentMonths: null, installmentTotalCents: null },
  };
}
function flatPlan(id = "pa2"): PlanAssignmentRow {
  return {
    id, planId: "plan-flat", effectiveStart: "2026-01-01", effectiveEnd: null, overrideAmountCents: null,
    plan: { id: "plan-flat", name: "Beginner monthly", planType: "flat_monthly", amountCents: 11000, installmentMonths: null, installmentTotalCents: null },
  };
}
function hsPlan(id = "pa3"): PlanAssignmentRow {
  return {
    id, planId: "plan-hs", effectiveStart: "2026-11-01", effectiveEnd: "2027-02-28", overrideAmountCents: null,
    plan: { id: "plan-hs", name: "High School Only", planType: "seasonal_installment", amountCents: null, installmentMonths: [11, 12, 1, 2], installmentTotalCents: 55000 },
  };
}

function attendance(overrides: Partial<AttendanceChargeInput> = {}): AttendanceChargeInput {
  return {
    attendanceId: "att1", diverId: "d1", familyId: "f1", diverName: "Jo Diver",
    groupId: G_BEGINNER, groupName: "Beginner / Orange",
    status: "present", billable: true,
    practice: { id: "p1", date: "2026-07-15", title: "Evening practice", facilityName: "BGSU", category: "weekday", status: "completed" },
    planAssignment: perPracticePlan(),
    rates,
    ...overrides,
  };
}

describe("money", () => {
  it("formats cents", () => {
    expect(formatCents(11000)).toBe("$110.00");
    expect(formatCents(-1850)).toBe("-$18.50");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
  });
  it("parses dollars safely", () => {
    expect(parseDollarsToCents("110")).toBe(11000);
    expect(parseDollarsToCents("$1,100.50")).toBe(110050);
    expect(parseDollarsToCents("18.5")).toBe(1850);
    expect(() => parseDollarsToCents("12.345")).toThrow();
    expect(() => parseDollarsToCents("abc")).toThrow();
  });
  it("splits seasonal totals exactly", () => {
    expect(splitEvenCents(55000, 4)).toEqual([13750, 13750, 13750, 13750]);
    expect(splitEvenCents(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEvenCents(10000, 3).reduce((a, b) => a + b)).toBe(10000);
  });
  it("rounds percentages half-up on the cent", () => {
    expect(percentOfCents(11000, 10)).toBe(1100);
    expect(percentOfCents(1500, 33)).toBe(495);
    expect(percentOfCents(1001, 50)).toBe(501);
  });
});

describe("timezone handling", () => {
  it("converts club-local wall time to UTC across DST", () => {
    // July (EDT, UTC-4): 17:30 local = 21:30 UTC
    expect(localToUtc("2026-07-15", "17:30").toISOString()).toBe("2026-07-15T21:30:00.000Z");
    // January (EST, UTC-5): 17:30 local = 22:30 UTC
    expect(localToUtc("2026-01-15", "17:30").toISOString()).toBe("2026-01-15T22:30:00.000Z");
  });
  it("round-trips local calendar dates", () => {
    const utc = localToUtc("2026-03-08", "20:00"); // DST transition day
    expect(toLocalYMD(utc)).toBe("2026-03-08");
    expect(localDayOfWeek(utc)).toBe(0); // Sunday
  });
  it("computes weekday from plain YMD", () => {
    expect(ymdDayOfWeek("2026-07-19")).toBe(0); // Sunday
    expect(ymdDayOfWeek("2026-07-15")).toBe(3); // Wednesday
  });
});

describe("effective-dated rate selection", () => {
  it("selects the group rate effective on the practice date", () => {
    expect(resolveRate(rates, G_BEGINNER, "weekday", "2026-07-15")?.amountCents).toBe(1500);
  });
  it("selects a future rate once effective, without touching earlier dates", () => {
    expect(resolveRate(rates, G_BEGINNER, "weekday", "2026-09-10")?.amountCents).toBe(1700);
    expect(resolveRate(rates, G_BEGINNER, "weekday", "2026-08-31")?.amountCents).toBe(1500);
  });
  it("prefers group-specific over club-wide fallback but falls back when needed", () => {
    expect(resolveRate(rates, G_BEGINNER, "clinic", "2026-07-15")?.amountCents).toBe(3000);
  });
  it("distinguishes Sunday from weekday", () => {
    expect(resolveRate(rates, G_ELITE, "sunday", "2026-07-19")?.amountCents).toBe(2500);
    expect(resolveRate(rates, G_ELITE, "weekday", "2026-07-15")?.amountCents).toBe(2000);
  });
  it("returns null when no rate exists", () => {
    expect(resolveRate(rates, "g-unknown", "weekday", "2020-01-01")).toBeNull();
  });
});

describe("plan assignment resolution", () => {
  it("returns the assignment covering the date; latest start wins on overlap", () => {
    const a = perPracticePlan("a");
    const b = { ...flatPlan("b"), effectiveStart: "2026-07-01" };
    expect(resolvePlanAssignment([a, b], "2026-07-15")?.id).toBe("b");
    expect(resolvePlanAssignment([a, b], "2026-06-15")?.id).toBe("a");
  });
  it("respects effective end for future plan switches", () => {
    const a = { ...perPracticePlan("a"), effectiveEnd: "2026-07-31" };
    const b = { ...flatPlan("b"), effectiveStart: "2026-08-01" };
    expect(resolvePlanAssignment([a, b], "2026-07-31")?.id).toBe("a");
    expect(resolvePlanAssignment([a, b], "2026-08-01")?.id).toBe("b");
  });
});

describe("attendance → charge conversion", () => {
  it("charges per-practice divers the weekday rate", () => {
    const r = computeAttendanceCharge(attendance());
    expect(r.kind).toBe("charge");
    if (r.kind === "charge") {
      expect(r.amountCents).toBe(1500);
      expect(r.sourceId).toBe("att1");
      expect(r.rateSnapshot.rateId).toBe("r1");
    }
  });
  it("charges the Sunday rate for Sunday practices", () => {
    const r = computeAttendanceCharge(attendance({
      practice: { id: "p2", date: "2026-07-19", title: "Sunday practice", facilityName: "BGSU", category: "sunday", status: "completed" },
    }));
    expect(r.kind === "charge" && r.amountCents).toBe(1800);
  });
  it("creates no per-practice charge for flat-rate divers", () => {
    const r = computeAttendanceCharge(attendance({ planAssignment: flatPlan() }));
    expect(r).toEqual({ kind: "none", reason: "covered by monthly/seasonal plan" });
  });
  it("trial attendance is non-billable by default", () => {
    const r = computeAttendanceCharge(attendance({ status: "trial", billable: false }));
    expect(r.kind).toBe("none");
  });
  it("a coach may override a trial to billable", () => {
    const r = computeAttendanceCharge(attendance({ status: "trial", billable: true }));
    expect(r.kind === "charge" && r.amountCents).toBe(1500);
  });
  it("absent, excused, and unmarked never bill", () => {
    for (const status of ["absent", "excused", "unmarked"] as const) {
      expect(computeAttendanceCharge(attendance({ status })).kind).toBe("none");
    }
  });
  it("canceled practices never bill", () => {
    const r = computeAttendanceCharge(attendance({
      practice: { ...attendance().practice, status: "canceled" },
    }));
    expect(r).toEqual({ kind: "none", reason: "practice canceled" });
  });
  it("non-billable practice categories never bill", () => {
    const r = computeAttendanceCharge(attendance({
      practice: { ...attendance().practice, category: "non_billable" },
    }));
    expect(r.kind).toBe("none");
  });
  it("a waived present diver bills nothing", () => {
    const r = computeAttendanceCharge(attendance({ billable: false }));
    expect(r).toEqual({ kind: "none", reason: "waived by coach" });
  });
  it("missing rate surfaces as no-charge exception rather than $0", () => {
    const r = computeAttendanceCharge(attendance({ groupId: "g-mystery", groupName: "Mystery", rates: [] }));
    expect(r).toEqual({ kind: "none", reason: "missing rate" });
  });
  it("uses the rate effective on the practice date, not today", () => {
    const r = computeAttendanceCharge(attendance({
      practice: { ...attendance().practice, date: "2026-09-10" },
    }));
    expect(r.kind === "charge" && r.amountCents).toBe(1700);
  });
  it("honors a per-assignment override amount", () => {
    const pa = perPracticePlan(); pa.overrideAmountCents = 1000;
    const r = computeAttendanceCharge(attendance({ planAssignment: pa }));
    expect(r.kind === "charge" && r.amountCents).toBe(1000);
  });
});

describe("monthly plan charges", () => {
  const base = { diverId: "d1", familyId: "f1", diverName: "Jo Diver" };
  it("creates one flat monthly charge per cycle", () => {
    const r = computeMonthlyPlanCharge({ ...base, cycleYear: 2026, cycleMonth: 7, planAssignment: flatPlan() });
    expect(r?.amountCents).toBe(11000);
    expect(r?.sourceId).toBe("pa2:2026-07");
  });
  it("skips months before the assignment starts", () => {
    const pa = { ...flatPlan(), effectiveStart: "2026-08-01" };
    expect(computeMonthlyPlanCharge({ ...base, cycleYear: 2026, cycleMonth: 7, planAssignment: pa })).toBeNull();
  });
  it("High School installments bill only Nov, Dec, Jan, Feb at $137.50", () => {
    for (const [y, m] of [[2026, 11], [2026, 12], [2027, 1], [2027, 2]] as const) {
      const r = computeMonthlyPlanCharge({ ...base, cycleYear: y, cycleMonth: m, planAssignment: hsPlan() });
      expect(r?.amountCents).toBe(13750);
    }
    expect(computeMonthlyPlanCharge({ ...base, cycleYear: 2026, cycleMonth: 10, planAssignment: hsPlan() })).toBeNull();
    expect(computeMonthlyPlanCharge({ ...base, cycleYear: 2027, cycleMonth: 3, planAssignment: hsPlan() })).toBeNull();
  });
  it("per-practice plans owe nothing monthly", () => {
    expect(computeMonthlyPlanCharge({ ...base, cycleYear: 2026, cycleMonth: 7, planAssignment: perPracticePlan() })).toBeNull();
  });
});

describe("invoice computation", () => {
  const lines = [
    { chargeId: "c1", diverId: "d1", description: "Monthly", amountCents: 11000 },
    { chargeId: "c2", diverId: "d2", description: "Practice", amountCents: 1500 },
    { chargeId: "c3", diverId: "d2", description: "Sunday practice", amountCents: 1800 },
  ];
  it("sums a multi-diver family invoice", () => {
    const r = computeInvoice(lines, [], 0, "2026-07-31");
    expect(r.subtotalCents).toBe(14300);
    expect(r.totalCents).toBe(14300);
  });
  it("applies fixed and percent discounts, diver-scoped where set", () => {
    const r = computeInvoice(lines, [
      { id: "s1", kind: "percent", label: "Sibling 10%", amountCents: null, percent: 10, diverId: "d2", effectiveStart: "2026-01-01", effectiveEnd: null },
      { id: "s2", kind: "fixed", label: "Scholarship", amountCents: 2000, percent: null, diverId: null, effectiveStart: "2026-01-01", effectiveEnd: null },
    ], 0, "2026-07-31");
    expect(r.discountLines).toEqual([
      { label: "Sibling 10%", amountCents: 330 },
      { label: "Scholarship", amountCents: 2000 },
    ]);
    expect(r.totalCents).toBe(14300 - 330 - 2000);
  });
  it("ignores discounts outside their effective window", () => {
    const r = computeInvoice(lines, [
      { id: "s1", kind: "percent", label: "Expired", amountCents: null, percent: 50, diverId: null, effectiveStart: "2025-01-01", effectiveEnd: "2025-12-31" },
    ], 0, "2026-07-31");
    expect(r.discountCents).toBe(0);
  });
  it("applies credit after discounts, carries the remainder, never goes negative", () => {
    const r = computeInvoice(lines, [], 20000, "2026-07-31");
    expect(r.creditAppliedCents).toBe(14300);
    expect(r.totalCents).toBe(0);
    expect(r.creditRemainingAfterCents).toBe(5700);
  });
  it("discounts can never push a total below zero", () => {
    const r = computeInvoice(
      [{ chargeId: "c1", diverId: "d1", description: "Practice", amountCents: 1500 }],
      [
        { id: "s1", kind: "fixed", label: "Big aid", amountCents: 5000, percent: null, diverId: null, effectiveStart: "2026-01-01", effectiveEnd: null },
      ], 0, "2026-07-31");
    expect(r.discountCents).toBe(1500);
    expect(r.totalCents).toBe(0);
  });
  it("empty invoice computes to zero", () => {
    const r = computeInvoice([], [], 1000, "2026-07-31");
    expect(r.subtotalCents).toBe(0);
    expect(r.creditAppliedCents).toBe(0);
    expect(r.totalCents).toBe(0);
  });
});
