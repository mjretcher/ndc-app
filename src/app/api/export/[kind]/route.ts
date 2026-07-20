import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { maybeCoach } from "@/lib/server/session";
import { toCsv } from "@/lib/csv";
import { formatCents } from "@/lib/money";
import type { YMD } from "@/lib/dates";

/**
 * CSV exports. Every report screen links here. Coach-visible data only:
 * medical details are intentionally NOT exportable through this endpoint.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const session = await maybeCoach();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { kind } = await ctx.params;
  const q = req.nextUrl.searchParams;
  const from = (q.get("from") ?? "1900-01-01") as YMD;
  const to = (q.get("to") ?? "2999-12-31") as YMD;
  const clubId = session.clubId;

  let csv: string;
  let name = kind;

  switch (kind) {
    case "roster": {
      const rows = await db.query.divers.findMany({
        where: eq(tables.divers.clubId, clubId),
        with: { family: { with: { guardians: true } }, primaryGroup: true },
        orderBy: (d, { asc }) => [asc(d.legalName)],
      });
      csv = toCsv(
        ["legal_name", "preferred_name", "birth_date", "status", "group", "family", "primary_guardian", "guardian_email", "guardian_phone", "school", "grade", "start_date"],
        rows.map((d) => {
          const g = d.family.guardians.find((x) => x.isPrimary) ?? d.family.guardians[0];
          return [d.legalName, d.preferredName, d.birthDate, d.status, d.primaryGroup?.name, d.family.billingName, g?.name, g?.email, g?.phone, d.school, d.grade, d.startDate];
        }),
      );
      break;
    }
    case "attendance": {
      const rows = await db.query.attendanceRecords.findMany({
        with: { practice: { with: { facility: true } }, diver: { with: { primaryGroup: true } } },
      });
      const filtered = rows.filter((r) =>
        r.practice.clubId === clubId &&
        (r.practice.practiceDate as YMD) >= from && (r.practice.practiceDate as YMD) <= to,
      );
      csv = toCsv(
        ["date", "practice", "facility", "category", "practice_status", "diver", "group", "attendance", "billable", "notes"],
        filtered
          .sort((a, b) => (a.practice.practiceDate < b.practice.practiceDate ? -1 : 1))
          .map((r) => [
            r.practice.practiceDate, r.practice.title, r.practice.facility?.name, r.practice.category,
            r.practice.status, r.diver.preferredName ?? r.diver.legalName, r.diver.primaryGroup?.name,
            r.status, r.billable ? "yes" : "no", r.notes,
          ]),
      );
      break;
    }
    case "charges": {
      const rows = await db.query.charges.findMany({
        where: and(
          eq(tables.charges.clubId, clubId),
          gte(tables.charges.serviceDate, from),
          lte(tables.charges.serviceDate, to),
        ),
        with: { family: true, diver: true },
        orderBy: (c, { asc }) => [asc(c.serviceDate)],
      });
      csv = toCsv(
        ["service_date", "family", "diver", "description", "amount", "status", "source"],
        rows.map((c) => [
          c.serviceDate, c.family.billingName, c.diver ? (c.diver.preferredName ?? c.diver.legalName) : "",
          c.description, formatCents(c.amountCents), c.status, c.sourceType,
        ]),
      );
      break;
    }
    case "invoices": {
      const rows = await db.query.invoices.findMany({
        where: eq(tables.invoices.clubId, clubId),
        with: { family: true, cycle: true },
      });
      csv = toCsv(
        ["number", "cycle", "family", "status", "issue_date", "due_date", "subtotal", "discounts", "credit_applied", "total"],
        rows.map((i) => [
          i.number ?? "(draft)", `${i.cycle.year}-${String(i.cycle.month).padStart(2, "0")}`, i.family.billingName,
          i.status, i.issueDate, i.dueDate, formatCents(i.subtotalCents), formatCents(i.discountCents),
          formatCents(i.creditAppliedCents), formatCents(i.totalCents),
        ]),
      );
      break;
    }
    case "memberships": {
      const rows = await db.query.divers.findMany({
        where: and(eq(tables.divers.clubId, clubId), inArray(tables.divers.status, ["active", "prospective"])),
        with: { memberships: true, family: { with: { guardians: true } } },
        orderBy: (d, { asc }) => [asc(d.legalName)],
      });
      const out: (string | null | undefined)[][] = [];
      for (const d of rows) {
        for (const org of ["aau", "usa_diving"] as const) {
          const m = d.memberships.find((x) => x.organization === org);
          const g = d.family.guardians.find((x) => x.isPrimary) ?? d.family.guardians[0];
          out.push([
            d.preferredName ?? d.legalName, org === "aau" ? "AAU" : "USA Diving",
            m?.membershipNumber, m?.membershipType, m?.expirationDate, m?.verification ?? "missing",
            g?.email,
          ]);
        }
      }
      csv = toCsv(["diver", "organization", "number", "type", "expires", "verification", "guardian_email"], out);
      break;
    }
    case "balances": {
      // Family balance = issued invoice totals - recorded payments - remaining credits
      const families = await db.query.families.findMany({
        where: eq(tables.families.clubId, clubId),
      });
      const invs = await db.query.invoices.findMany({
        where: and(eq(tables.invoices.clubId, clubId), inArray(tables.invoices.status, ["issued", "partially_paid", "paid"])),
      });
      const pays = await db.query.payments.findMany({});
      const creds = await db.query.credits.findMany({ where: eq(tables.credits.voided, false) });
      csv = toCsv(
        ["family", "invoiced_total", "payments_recorded", "open_balance", "credit_on_account"],
        families.map((f) => {
          const invoiced = invs.filter((i) => i.familyId === f.id).reduce((s, i) => s + i.totalCents, 0);
          const paid = pays.filter((p) => p.familyId === f.id).reduce((s, p) => s + p.amountCents, 0);
          const credit = creds.filter((c) => c.familyId === f.id).reduce((s, c) => s + c.remainingCents, 0);
          return [f.billingName, formatCents(invoiced), formatCents(paid), formatCents(invoiced - paid), formatCents(credit)];
        }),
      );
      break;
    }
    case "import-template": {
      csv = toCsv(
        [
          "family_billing_name", "guardian_name", "guardian_email", "guardian_phone",
          "address_line1", "city", "state", "zip",
          "diver_legal_name", "diver_preferred_name", "diver_birth_date", "group",
          "billing_plan", "aau_number", "aau_expires", "usa_diving_number", "usa_diving_expires",
        ],
        [[
          "The Rivera Family", "Jamie Rivera", "jamie@example.com", "419-555-0101",
          "123 Pool Ln", "Napoleon", "OH", "43545",
          "Alexandra Rivera", "Alex", "2013-04-02", "Beginner / Orange",
          "Beginner / Orange — Monthly", "A123456", "2026-08-31", "", "",
        ]],
      );
      name = "ndc-import-template";
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown export "${kind}".` }, { status: 404 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ndc-${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
