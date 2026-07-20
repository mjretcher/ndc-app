/**
 * The charge engine. Pure functions only — no database access, no side
 * effects. Server actions call these and persist results inside transactions.
 * All amounts are integer cents.
 */
import { splitEvenCents, percentOfCents } from "./money";
import { ymdInRange, type YMD } from "./dates";

export type PracticeCategory = "weekday" | "sunday" | "clinic" | "non_billable";
export type AttendanceStatus = "unmarked" | "present" | "absent" | "excused" | "trial";
export type PlanType = "flat_monthly" | "per_practice" | "seasonal_installment" | "custom";

export interface RateRow {
  id: string;
  groupId: string | null; // null = club-wide fallback
  category: PracticeCategory;
  amountCents: number;
  effectiveStart: YMD;
  effectiveEnd: YMD | null;
  priority: number;
}

export interface PlanAssignmentRow {
  id: string;
  planId: string;
  effectiveStart: YMD;
  effectiveEnd: YMD | null;
  overrideAmountCents: number | null;
  plan: {
    id: string;
    name: string;
    planType: PlanType;
    amountCents: number | null;
    installmentMonths: number[] | null;
    installmentTotalCents: number | null;
  };
}

/**
 * Resolve the rate effective on `serviceDate` for a group + category.
 * Group-specific rates beat club-wide fallbacks; then higher priority; then
 * the most recently effective start date.
 */
export function resolveRate(
  rates: RateRow[],
  groupId: string | null,
  category: PracticeCategory,
  serviceDate: YMD,
): RateRow | null {
  const candidates = rates.filter(
    (r) =>
      r.category === category &&
      (r.groupId === groupId || r.groupId === null) &&
      ymdInRange(serviceDate, r.effectiveStart, r.effectiveEnd),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aSpecific = a.groupId === groupId ? 1 : 0;
    const bSpecific = b.groupId === groupId ? 1 : 0;
    if (aSpecific !== bSpecific) return bSpecific - aSpecific;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.effectiveStart < b.effectiveStart ? 1 : -1;
  });
  return candidates[0];
}

/** Resolve which plan assignment is effective on a service date. Latest start wins on overlap. */
export function resolvePlanAssignment(
  assignments: PlanAssignmentRow[],
  serviceDate: YMD,
): PlanAssignmentRow | null {
  const active = assignments.filter((a) => ymdInRange(serviceDate, a.effectiveStart, a.effectiveEnd));
  if (active.length === 0) return null;
  active.sort((a, b) => (a.effectiveStart < b.effectiveStart ? 1 : -1));
  return active[0];
}

export interface AttendanceChargeInput {
  attendanceId: string;
  diverId: string;
  familyId: string;
  diverName: string;
  groupId: string | null;
  groupName: string | null;
  status: AttendanceStatus;
  billable: boolean; // coach-controlled override flag on the attendance record
  practice: {
    id: string;
    date: YMD;
    title: string;
    facilityName: string | null;
    category: PracticeCategory;
    status: "scheduled" | "changed" | "canceled" | "completed";
  };
  planAssignment: PlanAssignmentRow | null;
  rates: RateRow[];
}

export type DesiredCharge =
  | { kind: "none"; reason: string }
  | {
      kind: "charge";
      sourceType: "attendance";
      sourceId: string;
      familyId: string;
      diverId: string;
      serviceDate: YMD;
      description: string;
      amountCents: number;
      rateSnapshot: Record<string, unknown>;
    };

/**
 * Given an attendance record and billing context, compute the charge that
 * SHOULD exist. The persistence layer reconciles this against any existing
 * draft charge keyed by (sourceType, sourceId) — creating, updating, or
 * removing it idempotently. Charges already on an issued invoice are never
 * rewritten; corrections become adjustments instead.
 */
export function computeAttendanceCharge(input: AttendanceChargeInput): DesiredCharge {
  const { practice, status, billable, planAssignment } = input;

  if (practice.status === "canceled") return { kind: "none", reason: "practice canceled" };
  if (practice.category === "non_billable") return { kind: "none", reason: "non-billable practice" };
  if (status !== "present" && status !== "trial") {
    return { kind: "none", reason: `status ${status} is non-billable` };
  }
  // Trial is non-billable by default; a coach may flip `billable` with a reason.
  if (status === "trial" && !billable) return { kind: "none", reason: "trial (non-billable)" };
  // Present divers can be explicitly waived by clearing billable.
  if (!billable) return { kind: "none", reason: "waived by coach" };

  if (!planAssignment) return { kind: "none", reason: "no billing plan assigned" };
  const planType = planAssignment.plan.planType;
  if (planType === "flat_monthly" || planType === "seasonal_installment") {
    return { kind: "none", reason: "covered by monthly/seasonal plan" };
  }
  if (planType === "custom") {
    return { kind: "none", reason: "custom arrangement — bill manually" };
  }

  // per_practice
  const rate = resolveRate(input.rates, input.groupId, practice.category, practice.date);
  if (!rate && planAssignment.overrideAmountCents == null) {
    return { kind: "none", reason: "missing rate" }; // surfaced as a billing exception
  }
  const amountCents = planAssignment.overrideAmountCents ?? rate!.amountCents;
  const categoryLabel = practice.category === "sunday" ? "Sunday practice" : practice.category === "clinic" ? "Clinic" : "Practice";
  return {
    kind: "charge",
    sourceType: "attendance",
    sourceId: input.attendanceId,
    familyId: input.familyId,
    diverId: input.diverId,
    serviceDate: practice.date,
    description: `${categoryLabel} — ${input.diverName}${input.groupName ? ` (${input.groupName})` : ""} · ${practice.title}${input.practice.facilityName ? ` @ ${input.practice.facilityName}` : ""}${status === "trial" ? " · trial (billable override)" : ""}`,
    amountCents,
    rateSnapshot: {
      rateId: rate?.id ?? null,
      rateAmountCents: rate?.amountCents ?? null,
      overrideAmountCents: planAssignment.overrideAmountCents,
      planId: planAssignment.plan.id,
      planName: planAssignment.plan.name,
      category: practice.category,
      groupId: input.groupId,
    },
  };
}

export interface MonthlyChargeInput {
  diverId: string;
  familyId: string;
  diverName: string;
  cycleYear: number;
  cycleMonth: number; // 1-12
  planAssignment: PlanAssignmentRow;
}

/**
 * Compute the flat-monthly or seasonal-installment charge owed for a cycle,
 * or null if the plan owes nothing this month. Keyed for idempotency on
 * (sourceType, "planAssignmentId:YYYY-MM").
 */
export function computeMonthlyPlanCharge(input: MonthlyChargeInput): DesiredMonthlyCharge | null {
  const { planAssignment: pa, cycleYear, cycleMonth } = input;
  const monthKey = `${cycleYear}-${String(cycleMonth).padStart(2, "0")}`;
  const firstOfMonth: YMD = `${monthKey}-01`;
  const lastDay = new Date(Date.UTC(cycleYear, cycleMonth, 0)).getUTCDate();
  const endOfMonth: YMD = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

  // The assignment must overlap the cycle month at all.
  const overlaps = pa.effectiveStart <= endOfMonth && (pa.effectiveEnd === null || pa.effectiveEnd >= firstOfMonth);
  if (!overlaps) return null;

  const plan = pa.plan;
  if (plan.planType === "flat_monthly") {
    const amount = pa.overrideAmountCents ?? plan.amountCents;
    if (amount == null) return null;
    return {
      sourceType: "flat_monthly",
      sourceId: `${pa.id}:${monthKey}`,
      familyId: input.familyId,
      diverId: input.diverId,
      serviceDate: firstOfMonth,
      description: `${plan.name} — ${input.diverName} · ${monthName(cycleMonth)} ${cycleYear}`,
      amountCents: amount,
      rateSnapshot: { planId: plan.id, planName: plan.name, planType: plan.planType, amountCents: amount },
    };
  }

  if (plan.planType === "seasonal_installment") {
    const months = plan.installmentMonths ?? [];
    const idx = months.indexOf(cycleMonth);
    if (idx === -1 || plan.installmentTotalCents == null) return null;
    const parts = splitEvenCents(plan.installmentTotalCents, months.length);
    const amount = pa.overrideAmountCents ?? parts[idx];
    return {
      sourceType: "seasonal_installment",
      sourceId: `${pa.id}:${monthKey}`,
      familyId: input.familyId,
      diverId: input.diverId,
      serviceDate: firstOfMonth,
      description: `${plan.name} — ${input.diverName} · installment ${idx + 1} of ${months.length} (${monthName(cycleMonth)} ${cycleYear})`,
      amountCents: amount,
      rateSnapshot: {
        planId: plan.id, planName: plan.name, planType: plan.planType,
        installment: idx + 1, of: months.length, totalCents: plan.installmentTotalCents,
      },
    };
  }

  return null;
}

export interface DesiredMonthlyCharge {
  sourceType: "flat_monthly" | "seasonal_installment";
  sourceId: string;
  familyId: string;
  diverId: string;
  serviceDate: YMD;
  description: string;
  amountCents: number;
  rateSnapshot: Record<string, unknown>;
}

function monthName(m: number): string {
  return ["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1];
}

// ---------------------------------------------------------------------------
// Invoice math
// ---------------------------------------------------------------------------
export interface DiscountRow {
  id: string;
  kind: "fixed" | "percent";
  label: string;
  amountCents: number | null;
  percent: number | null;
  diverId: string | null; // null = family-wide
  effectiveStart: YMD;
  effectiveEnd: YMD | null;
}

export interface InvoiceChargeLine {
  chargeId: string;
  diverId: string | null;
  description: string;
  amountCents: number;
}

export interface InvoiceComputation {
  subtotalCents: number;
  discountLines: { label: string; amountCents: number }[];
  discountCents: number;
  creditAppliedCents: number;
  totalCents: number;
  creditRemainingAfterCents: number;
}

/**
 * Compute invoice totals. Percent discounts apply to the sum of eligible
 * charges (diver-scoped discounts to that diver's charges only). Credits
 * apply after discounts and never drive the total below zero.
 */
export function computeInvoice(
  chargesIn: InvoiceChargeLine[],
  discounts: DiscountRow[],
  availableCreditCents: number,
  asOfDate: YMD,
): InvoiceComputation {
  const subtotalCents = chargesIn.reduce((s, c) => s + c.amountCents, 0);

  const activeDiscounts = discounts.filter((d) => ymdInRange(asOfDate, d.effectiveStart, d.effectiveEnd));
  const discountLines: { label: string; amountCents: number }[] = [];
  let discountCents = 0;
  for (const d of activeDiscounts) {
    const base = d.diverId
      ? chargesIn.filter((c) => c.diverId === d.diverId).reduce((s, c) => s + c.amountCents, 0)
      : subtotalCents;
    let amt = 0;
    if (d.kind === "fixed") amt = Math.min(d.amountCents ?? 0, Math.max(0, base));
    else amt = percentOfCents(base, d.percent ?? 0);
    amt = Math.min(amt, subtotalCents - discountCents); // never discount below zero
    if (amt > 0) {
      discountLines.push({ label: d.label, amountCents: amt });
      discountCents += amt;
    }
  }

  const afterDiscount = Math.max(0, subtotalCents - discountCents);
  const creditAppliedCents = Math.min(availableCreditCents, afterDiscount);
  const totalCents = afterDiscount - creditAppliedCents;

  return {
    subtotalCents,
    discountLines,
    discountCents,
    creditAppliedCents,
    totalCents,
    creditRemainingAfterCents: availableCreditCents - creditAppliedCents,
  };
}
