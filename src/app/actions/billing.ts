"use server";

import { db, tables } from "@/db";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach, requireAdmin } from "@/lib/server/session";
import { recordAudit } from "@/lib/server/audit";
import { sendTemplatedEmail } from "@/lib/server/notify";
import { generateMonthlyCharges } from "@/lib/server/charge-sync";
import { computeInvoice, type DiscountRow, type InvoiceChargeLine } from "@/lib/billing-engine";
import { formatCents, parseDollarsToCents } from "@/lib/money";
import { monthLabel, todayYMD, addDaysYMD, type YMD } from "@/lib/dates";

/** Open (or return) the billing cycle for a month and generate plan charges. */
export async function openBillingCycle(formData: FormData) {
  const session = await requireAdmin();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!year || !month || month < 1 || month > 12) throw new Error("Pick a valid month.");

  await db.insert(tables.billingCycles)
    .values({ clubId: session.clubId, year, month, status: "open" })
    .onConflictDoNothing();
  const created = await generateMonthlyCharges(session.clubId, year, month, session.userId);

  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "billing.cycle.open", entityType: "billing_cycle", entityId: `${year}-${month}`,
      summary: `Opened ${monthLabel(year, month)} cycle; generated ${created} plan charge${created === 1 ? "" : "s"}`,
    });
  });

  revalidatePath("/billing");
  redirect(`/billing/${year}/${month}`);
}

/** Re-run monthly plan charge generation for an open cycle (idempotent). */
export async function regenerateCycleCharges(formData: FormData) {
  const session = await requireAdmin();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const created = await generateMonthlyCharges(session.clubId, year, month, session.userId);
  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "billing.cycle.regenerate", entityType: "billing_cycle", entityId: `${year}-${month}`,
      summary: `Regenerated plan charges for ${monthLabel(year, month)} (${created} new)`,
    });
  });
  revalidatePath(`/billing/${year}/${month}`);
}

export async function waiveCharge(formData: FormData) {
  const session = await requireCoach();
  const chargeId = String(formData.get("chargeId"));
  const reason = String(formData.get("reason") || "Waived by coach").trim();
  await db.transaction(async (tx) => {
    const charge = await tx.query.charges.findFirst({
      where: and(eq(tables.charges.id, chargeId), eq(tables.charges.clubId, session.clubId)),
    });
    if (!charge) throw new Error("Charge not found.");
    if (charge.status === "invoiced") throw new Error("This charge is on an issued invoice. Add an adjustment instead.");
    await tx.update(tables.charges).set({ status: "waived", waiveReason: reason, updatedAt: new Date() })
      .where(eq(tables.charges.id, chargeId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "charge.waive", entityType: "charge", entityId: chargeId,
      summary: `Waived ${formatCents(charge.amountCents)} — ${reason}`,
    });
  });
  revalidatePath("/billing");
}

export async function restoreCharge(formData: FormData) {
  const session = await requireCoach();
  const chargeId = String(formData.get("chargeId"));
  await db.transaction(async (tx) => {
    const charge = await tx.query.charges.findFirst({
      where: and(eq(tables.charges.id, chargeId), eq(tables.charges.clubId, session.clubId)),
    });
    if (!charge) throw new Error("Charge not found.");
    if (charge.status !== "waived" && charge.status !== "voided") return;
    await tx.update(tables.charges).set({ status: "draft", waiveReason: null, updatedAt: new Date() })
      .where(eq(tables.charges.id, chargeId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "charge.restore", entityType: "charge", entityId: chargeId,
      summary: `Restored charge ${formatCents(charge.amountCents)} to draft`,
    });
  });
  revalidatePath("/billing");
}

export async function addManualCharge(formData: FormData) {
  const session = await requireAdmin();
  const familyId = String(formData.get("familyId"));
  const diverId = String(formData.get("diverId") || "") || null;
  const description = String(formData.get("description") || "").trim();
  const amountCents = parseDollarsToCents(String(formData.get("amount")));
  const serviceDate = String(formData.get("serviceDate") || todayYMD()) as YMD;
  if (!description) throw new Error("Describe the charge.");

  await db.transaction(async (tx) => {
    const [c] = await tx.insert(tables.charges).values({
      clubId: session.clubId, familyId, diverId,
      sourceType: "manual", sourceId: `manual:${crypto.randomUUID()}`,
      serviceDate, description, amountCents,
      status: "draft", createdByUserId: session.userId,
    }).returning({ id: tables.charges.id });
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "charge.manual", entityType: "charge", entityId: c.id,
      summary: `Manual charge ${formatCents(amountCents)}: ${description}`,
    });
  });
  revalidatePath("/billing");
  revalidatePath(`/families/${familyId}`);
}

export async function addCredit(formData: FormData) {
  const session = await requireAdmin();
  const familyId = String(formData.get("familyId"));
  const amountCents = parseDollarsToCents(String(formData.get("amount")));
  const reason = String(formData.get("reason") || "").trim();
  if (amountCents <= 0) throw new Error("Credit must be positive.");
  if (!reason) throw new Error("Give the credit a reason.");
  await db.transaction(async (tx) => {
    const [c] = await tx.insert(tables.credits).values({
      familyId, amountCents, remainingCents: amountCents,
      reason, effectiveDate: todayYMD(), createdByUserId: session.userId,
    }).returning({ id: tables.credits.id });
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "credit.add", entityType: "credit", entityId: c.id,
      summary: `Credit ${formatCents(amountCents)} for family: ${reason}`,
    });
  });
  revalidatePath(`/families/${familyId}`);
  revalidatePath("/billing");
}

export async function recordPayment(formData: FormData) {
  const session = await requireAdmin();
  const familyId = String(formData.get("familyId"));
  const invoiceId = String(formData.get("invoiceId") || "") || null;
  const amountCents = parseDollarsToCents(String(formData.get("amount")));
  const method = String(formData.get("method") || "check");
  const reference = String(formData.get("reference") || "") || null;
  const receivedDate = String(formData.get("receivedDate") || todayYMD()) as YMD;

  await db.transaction(async (tx) => {
    await tx.insert(tables.payments).values({
      familyId, invoiceId, amountCents, method, reference, receivedDate,
      recordedByUserId: session.userId,
    });
    if (invoiceId) {
      const invoice = await tx.query.invoices.findFirst({ where: eq(tables.invoices.id, invoiceId) });
      if (invoice) {
        const paidRows = await tx.query.payments.findMany({ where: eq(tables.payments.invoiceId, invoiceId) });
        const paid = paidRows.reduce((s, p) => s + p.amountCents, 0);
        const newStatus = paid >= invoice.totalCents ? "paid" : "partially_paid";
        if (invoice.status === "issued" || invoice.status === "partially_paid") {
          await tx.update(tables.invoices).set({ status: newStatus }).where(eq(tables.invoices.id, invoiceId));
        }
      }
    }
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "payment.record", entityType: "payment", entityId: invoiceId,
      summary: `Recorded ${formatCents(amountCents)} ${method} payment`,
    });
  });
  revalidatePath("/billing");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/families/${familyId}`);
}

/**
 * Build (or rebuild) draft invoices for every family with draft charges dated
 * in the cycle month. Existing draft/ready invoices for the cycle are
 * replaced; issued invoices are untouched.
 */
export async function buildCycleInvoices(formData: FormData) {
  const session = await requireAdmin();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const firstOfMonth = `${monthKey}-01` as YMD;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endOfMonth = `${monthKey}-${String(lastDay).padStart(2, "0")}` as YMD;

  await db.transaction(async (tx) => {
    const cycle = await tx.query.billingCycles.findFirst({
      where: and(
        eq(tables.billingCycles.clubId, session.clubId),
        eq(tables.billingCycles.year, year),
        eq(tables.billingCycles.month, month),
      ),
    });
    if (!cycle) throw new Error("Open the cycle first.");
    if (cycle.status === "closed") throw new Error("This cycle is closed.");

    // Remove existing not-yet-approved invoices for this cycle and release their charges.
    const oldInvoices = await tx.query.invoices.findMany({
      where: and(
        eq(tables.invoices.cycleId, cycle.id),
        inArray(tables.invoices.status, ["draft", "ready_for_review"]),
      ),
    });
    if (oldInvoices.length > 0) {
      const ids = oldInvoices.map((i) => i.id);
      await tx.delete(tables.invoiceLines).where(inArray(tables.invoiceLines.invoiceId, ids));
      await tx.update(tables.charges)
        .set({ invoiceId: null, status: "draft" })
        .where(and(inArray(tables.charges.invoiceId, ids), eq(tables.charges.status, "reviewed")));
      await tx.delete(tables.invoices).where(inArray(tables.invoices.id, ids));
    }

    // Pool: all draft charges in the club with service date <= end of cycle month
    // (catches stragglers from prior months that were never invoiced).
    const pool = (await tx.query.charges.findMany({
      where: and(
        eq(tables.charges.clubId, session.clubId),
        eq(tables.charges.status, "draft"),
        lte(tables.charges.serviceDate, endOfMonth),
      ),
      with: { diver: true },
    })).filter((c) => !c.needsAttention); // $0 missing-rate markers stay out of invoices

    const byFamily = new Map<string, typeof pool>();
    for (const c of pool) {
      const arr = byFamily.get(c.familyId) ?? [];
      arr.push(c);
      byFamily.set(c.familyId, arr);
    }

    let built = 0;
    for (const [familyId, familyCharges] of byFamily) {
      const discountRows = await tx.query.discountsAndAid.findMany({
        where: and(eq(tables.discountsAndAid.familyId, familyId), eq(tables.discountsAndAid.active, true)),
      });
      const creditRows = await tx.query.credits.findMany({
        where: and(eq(tables.credits.familyId, familyId), eq(tables.credits.voided, false)),
      });
      const availableCredit = creditRows.reduce((s, c) => s + c.remainingCents, 0);

      const lines: InvoiceChargeLine[] = familyCharges.map((c) => ({
        chargeId: c.id, diverId: c.diverId, description: c.description, amountCents: c.amountCents,
      }));
      const discounts: DiscountRow[] = discountRows.map((d) => ({
        id: d.id, kind: d.kind, label: d.label, amountCents: d.amountCents,
        percent: d.percent, diverId: d.diverId,
        effectiveStart: d.effectiveStart as YMD, effectiveEnd: (d.effectiveEnd as YMD) ?? null,
      }));
      const calc = computeInvoice(lines, discounts, availableCredit, endOfMonth);

      const [invoice] = await tx.insert(tables.invoices).values({
        clubId: session.clubId, familyId, cycleId: cycle.id,
        subtotalCents: calc.subtotalCents,
        discountCents: calc.discountCents,
        creditAppliedCents: calc.creditAppliedCents,
        totalCents: calc.totalCents,
        status: "ready_for_review",
      }).returning();

      let sort = 0;
      for (const c of familyCharges) {
        await tx.insert(tables.invoiceLines).values({
          invoiceId: invoice.id, diverId: c.diverId, sourceChargeId: c.id,
          description: c.description, quantity: 1,
          rateCents: c.amountCents, amountCents: c.amountCents, sortOrder: sort++,
        });
        await tx.update(tables.charges).set({ status: "reviewed", invoiceId: invoice.id })
          .where(eq(tables.charges.id, c.id));
      }
      for (const d of calc.discountLines) {
        await tx.insert(tables.invoiceLines).values({
          invoiceId: invoice.id, description: `Discount — ${d.label}`,
          quantity: 1, rateCents: -d.amountCents, amountCents: -d.amountCents, sortOrder: sort++,
        });
      }
      built++;
    }

    await tx.update(tables.billingCycles).set({ status: "in_review" }).where(eq(tables.billingCycles.id, cycle.id));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "billing.invoices.build", entityType: "billing_cycle", entityId: cycle.id,
      summary: `Built ${built} draft invoice${built === 1 ? "" : "s"} for ${monthLabel(year, month)} (charges through ${firstOfMonth.slice(0, 7)})`,
    });
  });

  revalidatePath(`/billing/${year}/${month}`);
}

/** Approve + issue an invoice: assign number, consume credits, mark charges invoiced, email the family. */
export async function issueInvoice(formData: FormData) {
  const session = await requireAdmin();
  const invoiceId = String(formData.get("invoiceId"));

  let familyEmail: { email: string; name: string } | null = null;
  let issuedNumber = "";
  let cycleLabelStr = "";
  let totalStr = "";
  let dueStr = "";
  let summaryStr = "";

  await db.transaction(async (tx) => {
    const invoice = await tx.query.invoices.findFirst({
      where: and(eq(tables.invoices.id, invoiceId), eq(tables.invoices.clubId, session.clubId)),
      with: { family: { with: { guardians: true } }, cycle: true, lines: true },
    });
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "ready_for_review" && invoice.status !== "approved") {
      throw new Error("Only reviewed invoices can be issued.");
    }

    // Assign the immutable invoice number atomically.
    const [club] = await tx.update(tables.clubs)
      .set({ nextInvoiceNumber: sql`${tables.clubs.nextInvoiceNumber} + 1` })
      .where(eq(tables.clubs.id, session.clubId))
      .returning({ prefix: tables.clubs.invoicePrefix, next: tables.clubs.nextInvoiceNumber, terms: tables.clubs.invoiceTerms });
    const seq = club.next - 1;
    const number = `${club.prefix}-${invoice.cycle.year}${String(invoice.cycle.month).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;

    const issueDate = todayYMD();
    const dueDate = addDaysYMD(issueDate, 14);

    // Consume credits oldest-first up to creditAppliedCents.
    let toConsume = invoice.creditAppliedCents;
    if (toConsume > 0) {
      const creditRows = await tx.query.credits.findMany({
        where: and(eq(tables.credits.familyId, invoice.familyId), eq(tables.credits.voided, false)),
        orderBy: (c, { asc }) => [asc(c.effectiveDate), asc(c.createdAt)],
      });
      for (const c of creditRows) {
        if (toConsume <= 0) break;
        const take = Math.min(c.remainingCents, toConsume);
        if (take > 0) {
          await tx.update(tables.credits).set({ remainingCents: c.remainingCents - take })
            .where(eq(tables.credits.id, c.id));
          toConsume -= take;
        }
      }
      if (toConsume > 0) throw new Error("Family credit changed since this invoice was built. Rebuild invoices for the cycle.");
    }

    await tx.update(tables.invoices).set({
      number, issueDate, dueDate, status: "issued",
      issuedByUserId: session.userId, issuedAt: new Date(),
    }).where(eq(tables.invoices.id, invoiceId));

    await tx.update(tables.charges).set({ status: "invoiced" })
      .where(and(eq(tables.charges.invoiceId, invoiceId), eq(tables.charges.status, "reviewed")));

    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "invoice.issue", entityType: "invoice", entityId: invoiceId,
      summary: `Issued ${number} to ${invoice.family.billingName} — ${formatCents(invoice.totalCents)}`,
    });

    const primary = invoice.family.guardians.find((g) => g.isPrimary && g.email) ?? invoice.family.guardians.find((g) => g.email);
    if (primary?.email) familyEmail = { email: primary.email, name: primary.name };
    issuedNumber = number;
    cycleLabelStr = monthLabel(invoice.cycle.year, invoice.cycle.month);
    totalStr = formatCents(invoice.totalCents);
    dueStr = dueDate;
    summaryStr = invoice.lines
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => `• ${l.description}: ${formatCents(l.amountCents)}`)
      .join("\n");
    if (invoice.creditAppliedCents > 0) summaryStr += `\n• Account credit applied: -${formatCents(invoice.creditAppliedCents)}`;
  });

  if (familyEmail) {
    const fe = familyEmail as { email: string; name: string };
    await sendTemplatedEmail({
      clubId: session.clubId,
      eventType: "invoice_issued",
      recipientEmail: fe.email,
      fields: {
        guardian_name: fe.name,
        invoice_number: issuedNumber,
        cycle_label: cycleLabelStr,
        total: totalStr,
        due_date: dueStr,
        invoice_summary: summaryStr,
        payment_instructions: "Please pay by check or cash at practice, or contact Coach Mike about other arrangements.",
      },
      idempotencyKey: `invoice_issued:${invoiceId}`,
    });
  }

  revalidatePath("/billing");
  revalidatePath(`/invoices/${invoiceId}`);
}

/** Issue every ready invoice in a cycle. */
export async function issueAllReady(formData: FormData) {
  const session = await requireAdmin();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const cycle = await db.query.billingCycles.findFirst({
    where: and(
      eq(tables.billingCycles.clubId, session.clubId),
      eq(tables.billingCycles.year, year),
      eq(tables.billingCycles.month, month),
    ),
  });
  if (!cycle) throw new Error("Cycle not found.");
  const ready = await db.query.invoices.findMany({
    where: and(eq(tables.invoices.cycleId, cycle.id), eq(tables.invoices.status, "ready_for_review")),
    columns: { id: true },
  });
  for (const inv of ready) {
    const fd = new FormData();
    fd.set("invoiceId", inv.id);
    await issueInvoice(fd);
  }
  revalidatePath(`/billing/${year}/${month}`);
}

/** Void an issued invoice: reverse charges to draft (via released status) and restore credits. */
export async function voidInvoice(formData: FormData) {
  const session = await requireAdmin();
  const invoiceId = String(formData.get("invoiceId"));
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) throw new Error("A void reason is required.");

  await db.transaction(async (tx) => {
    const invoice = await tx.query.invoices.findFirst({
      where: and(eq(tables.invoices.id, invoiceId), eq(tables.invoices.clubId, session.clubId)),
    });
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status === "void") return;

    // Release charges back to draft so they can be re-invoiced.
    await tx.update(tables.charges).set({ status: "draft", invoiceId: null })
      .where(and(eq(tables.charges.invoiceId, invoiceId), inArray(tables.charges.status, ["invoiced", "reviewed"])));

    // Restore consumed credit.
    if (invoice.creditAppliedCents > 0 && invoice.status !== "draft" && invoice.status !== "ready_for_review") {
      await tx.insert(tables.credits).values({
        familyId: invoice.familyId,
        amountCents: invoice.creditAppliedCents,
        remainingCents: invoice.creditAppliedCents,
        reason: `Restored from voided invoice ${invoice.number ?? invoiceId}`,
        effectiveDate: todayYMD(),
        createdByUserId: session.userId,
      });
    }

    await tx.update(tables.invoices).set({ status: "void", voidReason: reason })
      .where(eq(tables.invoices.id, invoiceId));

    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "invoice.void", entityType: "invoice", entityId: invoiceId,
      summary: `Voided invoice ${invoice.number ?? "(draft)"} — ${reason}`,
    });
  });

  revalidatePath("/billing");
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function closeCycle(formData: FormData) {
  const session = await requireAdmin();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  await db.transaction(async (tx) => {
    await tx.update(tables.billingCycles).set({ status: "closed" })
      .where(and(
        eq(tables.billingCycles.clubId, session.clubId),
        eq(tables.billingCycles.year, year),
        eq(tables.billingCycles.month, month),
      ));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "billing.cycle.close", entityType: "billing_cycle", entityId: `${year}-${month}`,
      summary: `Closed ${monthLabel(year, month)} cycle`,
    });
  });
  revalidatePath("/billing");
  redirect("/billing");
}
