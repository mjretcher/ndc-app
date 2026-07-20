import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq, lte, inArray } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import {
  regenerateCycleCharges, waiveCharge, restoreCharge, buildCycleInvoices,
  issueAllReady, closeCycle,
} from "@/app/actions/billing";
import { monthLabel, todayYMD, type YMD } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Billing cycle" };

export default async function CyclePage({ params }: { params: Promise<{ year: string; month: string }> }) {
  const session = await requireCoach();
  const { year: ys, month: ms } = await params;
  const year = Number(ys), month = Number(ms);
  if (!year || !month || month < 1 || month > 12) notFound();

  const cycle = await db.query.billingCycles.findFirst({
    where: and(
      eq(tables.billingCycles.clubId, session.clubId),
      eq(tables.billingCycles.year, year),
      eq(tables.billingCycles.month, month),
    ),
  });
  if (!cycle) {
    return (
      <div className="card p-6">
        <p className="font-semibold">{monthLabel(year, month)} hasn&apos;t been opened yet.</p>
        <p className="text-sm text-mute mt-1">Open it from the <Link className="underline text-navy" href="/billing">billing home</Link> to generate plan charges.</p>
      </div>
    );
  }

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endOfMonth = `${monthKey}-${String(lastDay).padStart(2, "0")}` as YMD;

  // Draft + waived charges up through this month
  const chargesPool = await db.query.charges.findMany({
    where: and(
      eq(tables.charges.clubId, session.clubId),
      inArray(tables.charges.status, ["draft", "waived"]),
      lte(tables.charges.serviceDate, endOfMonth),
    ),
    with: { family: true, diver: true },
    orderBy: (c, { asc }) => [asc(c.serviceDate)],
  });
  const draft = chargesPool.filter((c) => c.status === "draft");
  const waived = chargesPool.filter((c) => c.status === "waived");

  // Exceptions: active divers with no current plan; missing-rate flags arrive as $0 attendance charges with needsAttention description
  const today = todayYMD();
  const activeDivers = await db.query.divers.findMany({
    where: and(eq(tables.divers.clubId, session.clubId), eq(tables.divers.status, "active")),
    with: { planAssignments: true, family: true },
  });
  const noPlan = activeDivers.filter((d) =>
    !d.planAssignments.some((a) => a.effectiveStart <= today && (!a.effectiveEnd || a.effectiveEnd >= today)));
  const flagged = draft.filter((c) => c.needsAttention);

  const invoices = await db.query.invoices.findMany({
    where: eq(tables.invoices.cycleId, cycle.id),
    with: { family: true },
    orderBy: (i, { asc }) => [asc(i.status)],
  });
  const ready = invoices.filter((i) => i.status === "ready_for_review");
  const issued = invoices.filter((i) => i.status === "issued" || i.status === "paid" || i.status === "partially_paid");

  const byFamily = new Map<string, typeof draft>();
  for (const c of draft) {
    const arr = byFamily.get(c.familyId) ?? [];
    arr.push(c);
    byFamily.set(c.familyId, arr);
  }
  const draftTotal = draft.reduce((s, c) => s + c.amountCents, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/billing" className="text-sm text-mute hover:text-navy">← Billing</Link>
          <h1 className="display text-2xl md:text-3xl mt-1">{monthLabel(year, month)}</h1>
          <p className="text-sm text-mute">
            Status: <span className="font-semibold">{cycle.status.replace(/_/g, " ")}</span>
            {" · "}{draft.length} draft charge{draft.length === 1 ? "" : "s"} totaling {formatCents(draftTotal)}
          </p>
        </div>
        {cycle.status !== "closed" && (
          <form action={regenerateCycleCharges}>
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <button className="btn btn-secondary">Re-generate plan charges</button>
          </form>
        )}
      </header>

      {/* Exceptions */}
      {(noPlan.length > 0 || flagged.length > 0) && (
        <section className="card border-warn bg-warn-soft/50 p-4">
          <h2 className="font-semibold text-warn">Fix these before invoicing</h2>
          <ul className="mt-2 text-sm space-y-1.5">
            {noPlan.map((d) => (
              <li key={d.id}>
                <Link href={`/divers/${d.id}`} className="font-semibold text-navy hover:underline">
                  {d.preferredName || d.legalName}
                </Link>{" "}
                ({d.family.billingName}) is active but has <strong>no billing plan</strong> — assign one or their practices won&apos;t bill.
              </li>
            ))}
            {flagged.map((c) => (
              <li key={c.id}>
                {c.description} — <Link href={`/families/${c.familyId}`} className="font-semibold text-navy hover:underline">{c.family.billingName}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Draft charges by family */}
      <section aria-labelledby="charges-h">
        <h2 id="charges-h" className="eyebrow mb-2">Charges awaiting review</h2>
        {byFamily.size === 0 ? (
          <div className="card p-5 text-mute">
            No draft charges. Plan charges appear when the cycle is generated; attendance charges appear as coaches mark divers present.
          </div>
        ) : (
          <div className="space-y-3">
            {[...byFamily.entries()].map(([familyId, list]) => (
              <div key={familyId} className="card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/families/${familyId}`} className="font-semibold text-navy hover:underline">
                    {list[0].family.billingName}
                  </Link>
                  <span className="font-semibold">{formatCents(list.reduce((s, c) => s + c.amountCents, 0))}</span>
                </div>
                <ul className="mt-2 text-sm space-y-1">
                  {list.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate">
                        {c.serviceDate} · {c.description}
                        {c.diver && <span className="text-mute"> — {c.diver.preferredName || c.diver.legalName}</span>}
                      </span>
                      <span className="font-semibold shrink-0">{formatCents(c.amountCents)}</span>
                      {cycle.status !== "closed" && (
                        <form action={waiveCharge}>
                          <input type="hidden" name="chargeId" value={c.id} />
                          <input type="hidden" name="reason" value="Waived during cycle review" />
                          <button className="text-xs font-semibold text-mute hover:text-danger" title="Waive this charge">Waive</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {waived.length > 0 && (
          <details className="mt-3">
            <summary className="text-sm font-semibold text-mute cursor-pointer">{waived.length} waived charge{waived.length === 1 ? "" : "s"}</summary>
            <ul className="mt-2 text-sm space-y-1 text-mute">
              {waived.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="flex-1 line-through truncate">{c.serviceDate} · {c.description} ({c.family.billingName})</span>
                  <span>{formatCents(c.amountCents)}</span>
                  {cycle.status !== "closed" && (
                    <form action={restoreCharge}>
                      <input type="hidden" name="chargeId" value={c.id} />
                      <button className="text-xs font-semibold text-navy">Restore</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Build + invoices */}
      <section aria-labelledby="inv-h" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="inv-h" className="eyebrow">Invoices</h2>
          {cycle.status !== "closed" && draft.length > 0 && (
            <form action={buildCycleInvoices}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <button className="btn btn-primary">
                {ready.length > 0 ? "Rebuild draft invoices" : "Build invoices from charges"}
              </button>
            </form>
          )}
          {ready.length > 0 && (
            <form action={issueAllReady}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <button className="btn btn-secondary">Issue all {ready.length} ready</button>
            </form>
          )}
        </div>
        {invoices.length === 0 ? (
          <div className="card p-5 text-mute">
            Nothing built yet. When the charges above look right, build invoices — you&apos;ll review each family&apos;s
            total before anything is sent.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="data">
              <thead><tr><th>Family</th><th>Subtotal</th><th>Discounts</th><th>Credit</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><Link href={`/invoices/${inv.id}`} className="font-semibold text-navy hover:underline">{inv.family.billingName}</Link></td>
                    <td>{formatCents(inv.subtotalCents)}</td>
                    <td>{inv.discountCents > 0 ? `-${formatCents(inv.discountCents)}` : "—"}</td>
                    <td>{inv.creditAppliedCents > 0 ? `-${formatCents(inv.creditAppliedCents)}` : "—"}</td>
                    <td className="font-semibold">{formatCents(inv.totalCents)}</td>
                    <td><span className={`chip ${
                      inv.status === "paid" ? "chip-ok" : inv.status === "issued" ? "chip-navy" :
                      inv.status === "partially_paid" ? "chip-warn" : inv.status === "void" ? "chip-mute" : "chip-accent"
                    }`}>{inv.status === "ready_for_review" ? "ready" : inv.status.replace(/_/g, " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cycle.status !== "closed" && issued.length > 0 && draft.length === 0 && ready.length === 0 && (
        <form action={closeCycle} className="card p-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <button className="btn btn-secondary">Close {monthLabel(year, month)}</button>
          <p className="hint flex-1 min-w-48">Everything is issued. Closing locks the month; late corrections become adjustments on next month&apos;s invoices.</p>
        </form>
      )}
    </div>
  );
}
