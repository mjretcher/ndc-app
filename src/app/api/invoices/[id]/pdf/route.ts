import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { maybeCoach } from "@/lib/server/session";
import { renderInvoicePdf } from "@/lib/server/invoice-pdf";
import type { YMD } from "@/lib/dates";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await maybeCoach();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await ctx.params;
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(tables.invoices.id, id), eq(tables.invoices.clubId, session.clubId)),
    with: { family: true, cycle: true, lines: { with: { diver: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const club = await db.query.clubs.findFirst({ where: eq(tables.clubs.id, session.clubId) });

  const f = invoice.family;
  const address = [
    f.addressLine1, f.addressLine2,
    [f.city, f.state, f.zip].filter(Boolean).join(", ") || null,
  ].filter((l): l is string => Boolean(l));

  const pdf = await renderInvoicePdf({
    clubName: club?.name ?? "Napoleon Diving Club",
    contactEmail: club?.contactEmail ?? null,
    invoiceNumber: invoice.number ?? "DRAFT",
    status: invoice.status,
    cycleYear: invoice.cycle.year,
    cycleMonth: invoice.cycle.month,
    issueDate: (invoice.issueDate as YMD) ?? null,
    dueDate: (invoice.dueDate as YMD) ?? null,
    familyName: f.billingName,
    familyAddress: address,
    lines: invoice.lines
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({
        description: l.description,
        amountCents: l.amountCents,
        diverName: l.diver ? (l.diver.preferredName ?? l.diver.legalName) : null,
      })),
    subtotalCents: invoice.subtotalCents,
    discountCents: invoice.discountCents,
    creditAppliedCents: invoice.creditAppliedCents,
    totalCents: invoice.totalCents,
    terms: club?.invoiceTerms ?? null,
  });

  const filename = `${invoice.number ?? `draft-${invoice.id.slice(0, 8)}`}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
