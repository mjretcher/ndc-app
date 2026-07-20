import { db, tables } from "@/db";
import { eq, asc, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/session";
import { addRate, confirmRate, upsertPlan } from "@/app/actions/settings";
import { formatCents } from "@/lib/money";
import { todayYMD } from "@/lib/dates";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const session = await requireAdmin();
  const today = todayYMD();

  const groups = await db.query.groups.findMany({
    where: eq(tables.groups.clubId, session.clubId),
    orderBy: [asc(tables.groups.sortOrder)],
  });
  const rates = await db.query.rateSchedules.findMany({
    where: eq(tables.rateSchedules.clubId, session.clubId),
    orderBy: [desc(tables.rateSchedules.effectiveStart)],
  });
  const plans = await db.query.billingPlans.findMany({
    where: eq(tables.billingPlans.clubId, session.clubId),
    orderBy: [asc(tables.billingPlans.name)],
  });

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "All groups";
  const unconfirmed = rates.filter((r) => r.confirmBeforeLaunch).length +
    plans.filter((p) => p.confirmBeforeLaunch).length;

  return (
    <div className="space-y-6">
      {unconfirmed > 0 && (
        <p className="card border-warn bg-warn-soft p-3 text-sm text-warn">
          {unconfirmed} price{unconfirmed === 1 ? "" : "s"} below {unconfirmed === 1 ? "is" : "are"} seeded
          guesses — confirm each one before issuing real invoices.
        </p>
      )}

      <section className="card p-4">
        <h2 className="display text-lg mb-3">Per-practice rates</h2>
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Group</th><th>Category</th><th>Rate</th><th>Effective</th><th></th></tr></thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className={r.effectiveEnd && r.effectiveEnd < today ? "opacity-50" : ""}>
                  <td>{groupName(r.groupId)}</td>
                  <td className="capitalize">{r.category.replace(/_/g, " ")}</td>
                  <td className="font-semibold">{formatCents(r.amountCents)}</td>
                  <td className="text-sm">{r.effectiveStart}{r.effectiveEnd ? ` → ${r.effectiveEnd}` : " → ongoing"}</td>
                  <td>
                    {r.confirmBeforeLaunch && (
                      <form action={confirmRate}>
                        <input type="hidden" name="rateId" value={r.id} />
                        <button className="chip chip-warn hover:bg-warn hover:text-white">Confirm this price</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3">
          <summary className="text-sm font-semibold text-navy cursor-pointer">Add a rate change</summary>
          <form action={addRate} className="mt-2 grid gap-2 md:grid-cols-5 items-end">
            <div>
              <label className="label" htmlFor="rg">Group</label>
              <select id="rg" name="groupId" className="input">
                <option value="">All groups (default)</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rc">Category</label>
              <select id="rc" name="category" className="input">
                <option value="weekday">Weekday</option>
                <option value="sunday">Sunday</option>
                <option value="clinic">Clinic</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ra">Amount</label>
              <input id="ra" name="amount" required placeholder="$20.00" inputMode="decimal" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="rs">Effective from</label>
              <input id="rs" name="effectiveStart" type="date" defaultValue={today} required className="input" />
            </div>
            <button className="btn btn-primary">Add rate</button>
          </form>
          <p className="hint mt-2">
            The old rate automatically ends the day before. Practices are always billed at the rate in effect on
            their date, so history never changes.
          </p>
        </details>
      </section>

      <section className="card p-4">
        <h2 className="display text-lg mb-3">Billing plans</h2>
        <div className="space-y-3">
          {plans.map((p) => (
            <details key={p.id} className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                <span className="chip chip-mute capitalize">{p.planType.replace(/_/g, " ")}</span>
                {p.amountCents != null && <span className="text-sm">{formatCents(p.amountCents)}/mo</span>}
                {p.installmentTotalCents != null && (
                  <span className="text-sm">{formatCents(p.installmentTotalCents)} over months {(p.installmentMonths as number[] | null)?.join(", ")}</span>
                )}
                {!p.active && <span className="chip chip-mute">inactive</span>}
                {p.confirmBeforeLaunch && <span className="chip chip-warn">confirm price</span>}
              </summary>
              <form action={upsertPlan} className="mt-3 grid gap-2 md:grid-cols-2">
                <input type="hidden" name="planId" value={p.id} />
                <input type="hidden" name="planType" value={p.planType} />
                <input name="name" defaultValue={p.name} className="input" aria-label="Plan name" />
                <select name="groupId" defaultValue={p.groupId ?? ""} className="input" aria-label="Group">
                  <option value="">Any group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                {p.planType === "flat_monthly" && (
                  <input name="amount" defaultValue={p.amountCents != null ? (p.amountCents / 100).toFixed(2) : ""} placeholder="Monthly $" className="input" aria-label="Monthly amount" />
                )}
                {p.planType === "seasonal_installment" && (
                  <>
                    <input name="installmentTotal" defaultValue={p.installmentTotalCents != null ? (p.installmentTotalCents / 100).toFixed(2) : ""} placeholder="Season total $" className="input" aria-label="Season total" />
                    <input name="installmentMonths" defaultValue={(p.installmentMonths as number[] | null)?.join(",") ?? ""} placeholder="Months e.g. 11,12,1,2" className="input" aria-label="Installment months" />
                  </>
                )}
                <input name="notes" defaultValue={p.notes ?? ""} placeholder="Notes" className="input md:col-span-2" aria-label="Notes" />
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" name="active" defaultChecked={p.active} /> Active (selectable for divers)
                </label>
                <button className="btn btn-secondary">Save plan</button>
              </form>
            </details>
          ))}
        </div>
        <details className="mt-3">
          <summary className="text-sm font-semibold text-navy cursor-pointer">Add a plan</summary>
          <form action={upsertPlan} className="mt-2 grid gap-2 md:grid-cols-2">
            <input name="name" required placeholder="Plan name" className="input" aria-label="Name" />
            <select name="planType" className="input" aria-label="Type">
              <option value="flat_monthly">Flat monthly</option>
              <option value="per_practice">Per practice</option>
              <option value="seasonal_installment">Seasonal installments</option>
              <option value="custom">Custom (manual billing)</option>
            </select>
            <select name="groupId" className="input" aria-label="Group">
              <option value="">Any group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input name="amount" placeholder="Monthly $ (flat plans)" className="input" aria-label="Monthly amount" />
            <input name="installmentTotal" placeholder="Season total $ (seasonal)" className="input" aria-label="Season total" />
            <input name="installmentMonths" placeholder="Months e.g. 11,12,1,2" className="input" aria-label="Months" />
            <button className="btn btn-primary md:col-span-2">Create plan</button>
          </form>
        </details>
      </section>
    </div>
  );
}
