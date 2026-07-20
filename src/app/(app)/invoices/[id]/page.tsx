import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { issueInvoice, voidInvoice, recordPayment } from "@/app/actions/billing";
import { formatCents } from "@/lib/money";
import { monthLabel, todayYMD } from "@/lib/dates";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCoach();
  const { id } = await params;
  const today = todayYMD();

  const invoice = await db.query.invoices.findFirst({
    where: and(eq(tables.invoices.id, id), eq(tables.invoices.clubId, session.clubId)),
    with: {
      family: { with: { guardians: true } },
      cycle: true,
      lines: true,
      payments: true,
    },
  });
  if (!invoice) notFound();

  const paid = invoice.payments.reduce((s, p) => s + p.amountCents, 0);
  const owed = Math.max(0, invoice.totalCents - paid);
  const lines = [...invoice.lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const canIssue = invoice.status === "ready_for_review";
  const canVoid = invoice.status !== "void" && invoice.status !== "draft";
  const primary = invoice.family.guardians.find((g) => g.isPrimary && g.email) ?? invoice.family.guardians.find((g) => g.email);

  return (
    <div className="space-y-5 max-w-2xl">
      <header>
        <Link href={`/billing/${invoice.cycle.year}/${invoice.cycle.month}`} className="text-sm text-mute hover:text-navy">
          ← {monthLabel(invoice.cycle.year, invoice.cycle.month)} cycle
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="display text-2xl md:text-3xl">{invoice.number ?? "Draft invoice"}</h1>
          <span className={`chip ${
            invoice.status === "paid" ? "chip-ok" : invoice.status === "issued" ? "chip-navy" :
            invoice.status === "partially_paid" ? "chip-warn" : invoice.status === "void" ? "chip-mute" : "chip-accent"
          }`}>{invoice.status === "ready_for_review" ? "ready for review" : invoice.status.replace(/_/g, " ")}</span>
        </div>
        <p className="text-sm text-mute mt-1">
          <Link href={`/families/${invoice.familyId}`} className="font-semibold text-navy hover:underline">{invoice.family.billingName}</Link>
          {invoice.issueDate && ` · issued ${invoice.issueDate}`}
          {invoice.dueDate && ` · due ${invoice.dueDate}`}
          {primary?.email && ` · ${primary.email}`}
        </p>
        {invoice.voidReason && <p className="mt-2 text-sm text-danger">Voided: {invoice.voidReason}</p>}
      </header>

      <section className="card p-4">
        <table className="data">
          <thead><tr><th>Line</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className={`text-right ${l.amountCents < 0 ? "text-ok" : ""}`}>{formatCents(l.amountCents)}</td>
              </tr>
            ))}
            {invoice.creditAppliedCents > 0 && (
              <tr><td className="text-ok">Account credit applied</td><td className="text-right text-ok">-{formatCents(invoice.creditAppliedCents)}</td></tr>
            )}
            <tr className="font-bold">
              <td>Total</td><td className="text-right">{formatCents(invoice.totalCents)}</td>
            </tr>
            {paid > 0 && (
              <>
                <tr><td>Paid</td><td className="text-right">-{formatCents(paid)}</td></tr>
                <tr className="font-bold"><td>Balance</td><td className="text-right">{formatCents(owed)}</td></tr>
              </>
            )}
          </tbody>
        </table>
      </section>

      <div className="flex flex-wrap gap-2">
        {canIssue && (
          <form action={issueInvoice}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button className="btn btn-primary">Approve &amp; issue{primary?.email ? " + email family" : ""}</button>
          </form>
        )}
        {invoice.number && (
          <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" className="btn btn-secondary">Download PDF</a>
        )}
      </div>

      {(invoice.status === "issued" || invoice.status === "partially_paid") && (
        <form action={recordPayment} className="card p-4 grid gap-2 md:grid-cols-4 items-end">
          <input type="hidden" name="familyId" value={invoice.familyId} />
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <div>
            <label className="label" htmlFor="amt">Payment</label>
            <input id="amt" name="amount" required defaultValue={(owed / 100).toFixed(2)} inputMode="decimal" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="method">Method</label>
            <select id="method" name="method" className="input">
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rdate">Received</label>
            <input id="rdate" name="receivedDate" type="date" defaultValue={today} className="input" />
          </div>
          <button className="btn btn-primary">Record payment</button>
        </form>
      )}

      {invoice.payments.length > 0 && (
        <section className="card p-4">
          <h2 className="eyebrow mb-2">Payments</h2>
          <ul className="text-sm space-y-1">
            {invoice.payments.map((p) => (
              <li key={p.id}>{p.receivedDate}: {formatCents(p.amountCents)} by {p.method}{p.reference ? ` (${p.reference})` : ""}</li>
            ))}
          </ul>
        </section>
      )}

      {canVoid && (
        <details className="card p-4 border-danger/40">
          <summary className="font-semibold text-danger cursor-pointer">Void this invoice</summary>
          <form action={voidInvoice} className="mt-3 space-y-2">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input name="reason" required placeholder="Reason (required, kept in the audit log)" className="input" />
            <button className="btn btn-danger">Void invoice</button>
            <p className="hint">
              Its charges go back to draft for re-invoicing and any consumed credit is restored.
              The invoice number is never reused.
            </p>
          </form>
        </details>
      )}
    </div>
  );
}
