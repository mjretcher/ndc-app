import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, desc, or, inArray } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { openBillingCycle } from "@/app/actions/billing";
import { monthLabel } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const session = await requireCoach();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const cycles = await db.query.billingCycles.findMany({
    where: eq(tables.billingCycles.clubId, session.clubId),
    orderBy: [desc(tables.billingCycles.year), desc(tables.billingCycles.month)],
    limit: 18,
  });

  const openInvoices = await db.query.invoices.findMany({
    where: and(
      eq(tables.invoices.clubId, session.clubId),
      or(eq(tables.invoices.status, "issued"), eq(tables.invoices.status, "partially_paid")),
    ),
    with: { family: true },
    orderBy: [desc(tables.invoices.issuedAt)],
  });
  const pays = openInvoices.length > 0 ? await db.query.payments.findMany({
    where: inArray(tables.payments.invoiceId, openInvoices.map((i) => i.id)),
  }) : [];
  const paidBy = new Map<string, number>();
  for (const p of pays) if (p.invoiceId) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amountCents);

  const cycleChip = (s: string) =>
    s === "open" ? "chip-navy" : s === "in_review" ? "chip-accent" : s === "issued" ? "chip-ok" : "chip-mute";

  const hasCurrent = cycles.some((c) => c.year === y && c.month === m);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Money</p>
          <h1 className="display text-2xl md:text-3xl">Billing</h1>
        </div>
        {!hasCurrent && (
          <form action={openBillingCycle}>
            <input type="hidden" name="year" value={y} />
            <input type="hidden" name="month" value={m} />
            <button className="btn btn-primary">Open {monthLabel(y, m)}</button>
          </form>
        )}
      </header>

      <section aria-labelledby="cycles-h">
        <h2 id="cycles-h" className="eyebrow mb-2">Monthly cycles</h2>
        {cycles.length === 0 ? (
          <div className="card p-6 text-mute">
            No billing cycles yet. Open the current month to generate plan charges and start the review flow.
          </div>
        ) : (
          <ul className="card divide-y divide-line">
            {cycles.map((c) => (
              <li key={c.id}>
                <Link href={`/billing/${c.year}/${c.month}`} className="flex items-center gap-3 p-4 hover:bg-paper">
                  <span className="font-semibold flex-1">{monthLabel(c.year, c.month)}</span>
                  <span className={`chip ${cycleChip(c.status)}`}>{c.status.replace(/_/g, " ")}</span>
                  <span aria-hidden className="text-mute">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-3">
          <summary className="text-sm font-semibold text-navy cursor-pointer">Open a different month</summary>
          <form action={openBillingCycle} className="mt-2 flex gap-2 items-end">
            <div>
              <label className="label" htmlFor="oy">Year</label>
              <input id="oy" name="year" type="number" defaultValue={y} className="input !w-28" />
            </div>
            <div>
              <label className="label" htmlFor="om">Month</label>
              <input id="om" name="month" type="number" min={1} max={12} defaultValue={m} className="input !w-20" />
            </div>
            <button className="btn btn-secondary">Open cycle</button>
          </form>
        </details>
      </section>

      <section aria-labelledby="out-h">
        <h2 id="out-h" className="eyebrow mb-2">Outstanding invoices</h2>
        {openInvoices.length === 0 ? (
          <div className="card p-5 text-mute">Nothing outstanding. 🎉</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="data">
              <thead><tr><th>Invoice</th><th>Family</th><th>Total</th><th>Still owed</th><th>Due</th></tr></thead>
              <tbody>
                {openInvoices.map((inv) => {
                  const owed = Math.max(0, inv.totalCents - (paidBy.get(inv.id) ?? 0));
                  const overdue = inv.dueDate && inv.dueDate < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={inv.id}>
                      <td><Link href={`/invoices/${inv.id}`} className="font-semibold text-navy hover:underline">{inv.number}</Link></td>
                      <td><Link href={`/families/${inv.familyId}`} className="hover:underline">{inv.family.billingName}</Link></td>
                      <td>{formatCents(inv.totalCents)}</td>
                      <td className="font-semibold">{formatCents(owed)}</td>
                      <td>{overdue ? <span className="chip chip-danger">{inv.dueDate}</span> : inv.dueDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
