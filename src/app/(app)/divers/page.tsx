import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, ilike, asc, or } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { todayYMD } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { quickAddDiverForm } from "@/app/actions/quick-add";
import { UNREGISTERED_FAMILY_STATUS } from "@/lib/server/family-merge";

export const metadata = { title: "Divers" };

export default async function DiversPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string; status?: string }> }) {
  const session = await requireCoach();
  const { q, group, status } = await searchParams;
  const today = todayYMD();

  const groups = await db.query.groups.findMany({
    where: eq(tables.groups.clubId, session.clubId),
    orderBy: [asc(tables.groups.sortOrder)],
  });

  const plans = await db.query.billingPlans.findMany({
    where: and(eq(tables.billingPlans.clubId, session.clubId), eq(tables.billingPlans.active, true)),
  });
  const defaultPlanId = plans.find((p) => p.planType === "per_practice")?.id ?? "";

  const conds = [eq(tables.divers.clubId, session.clubId)];
  if (q) conds.push(or(ilike(tables.divers.legalName, `%${q}%`), ilike(tables.divers.preferredName, `%${q}%`))!);
  if (group) conds.push(eq(tables.divers.primaryGroupId, group));
  const onlyUnregistered = status === "unregistered";
  if (status && !onlyUnregistered) conds.push(eq(tables.divers.status, status as "active" | "inactive" | "prospective" | "merged"));
  else if (!q || onlyUnregistered) conds.push(eq(tables.divers.status, "active"));

  const allRows = await db.query.divers.findMany({
    where: and(...conds),
    with: { primaryGroup: true, family: true, memberships: true, planAssignments: { with: { plan: true } } },
    orderBy: [asc(tables.divers.legalName)],
    limit: 300,
  });
  const rows = onlyUnregistered ? allRows.filter((d) => d.family.status === UNREGISTERED_FAMILY_STATUS) : allRows;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="display text-2xl md:text-3xl">Divers</h1>
        </div>
        <form className="flex flex-wrap gap-2" action="/divers">
          <label htmlFor="q" className="sr-only">Search divers</label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Search names" className="input !w-44" />
          <select name="group" defaultValue={group ?? ""} className="input !w-auto" aria-label="Filter by group">
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select name="status" defaultValue={status ?? ""} className="input !w-auto" aria-label="Filter by status">
            <option value="">Active</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="unregistered">Not yet registered</option>
            <option value="prospective">Prospective</option>
            <option value="merged">Merged (duplicate records)</option>
          </select>
          <button className="btn btn-secondary">Filter</button>
        </form>
      </header>

      <details className="card p-4">
        <summary className="font-semibold text-navy cursor-pointer">+ Quick add a diver who hasn&apos;t registered yet</summary>
        <p className="hint mt-2">
          Gets a kid on the roster so you can take attendance and bill right away. Only the name is required.
          When the family submits the registration form, you&apos;ll link it to this diver on the approval screen.
        </p>
        <form action={quickAddDiverForm} className="mt-3 grid gap-2 md:grid-cols-2">
          <input name="name" required placeholder="Diver's full name" className="input" aria-label="Diver's full name" />
          <select name="groupId" defaultValue="" className="input" aria-label="Group">
            <option value="">Group — decide later</option>
            {groups.filter((g) => g.active).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select name="planId" defaultValue={defaultPlanId} className="input" aria-label="Billing plan">
            <option value="">Billing plan — decide later</option>
            {plans.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}{pl.amountCents ? ` (${formatCents(pl.amountCents)}/mo)` : pl.installmentTotalCents ? ` (${formatCents(pl.installmentTotalCents)} season)` : ""}
              </option>
            ))}
          </select>
          <label className="text-sm flex items-center gap-2">
            <span className="whitespace-nowrap">First practice</span>
            <input name="startDate" type="date" defaultValue={today} max={today} className="input" aria-label="First practice date" />
          </label>
          <input name="parentName" placeholder="Parent name (optional)" className="input" aria-label="Parent name" />
          <input name="parentEmail" type="email" placeholder="Parent email (optional)" className="input" aria-label="Parent email" />
          <input name="parentPhone" type="tel" placeholder="Parent phone (optional)" className="input" aria-label="Parent phone" />
          <button className="btn btn-primary">Add diver</button>
        </form>
      </details>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr><th>Diver</th><th>Group</th><th>Plan</th><th>AAU</th><th>USA Diving</th><th>Family</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-mute p-5">No divers match. Adjust the filters or approve a registration.</td></tr>
            )}
            {rows.map((d) => {
              const plan = d.planAssignments
                .filter((a) => a.effectiveStart <= today && (!a.effectiveEnd || a.effectiveEnd >= today))
                .sort((a, b) => (a.effectiveStart < b.effectiveStart ? 1 : -1))[0];
              const mem = (org: "aau" | "usa_diving") => {
                const m = d.memberships.find((x) => x.organization === org);
                if (!m || m.verification === "missing") return <span className="chip chip-danger">Missing</span>;
                if (m.verification === "expired" || (m.expirationDate && m.expirationDate < today)) return <span className="chip chip-danger">Expired</span>;
                if (m.verification === "pending") return <span className="chip chip-warn">Pending</span>;
                return <span className="chip chip-ok">Verified</span>;
              };
              return (
                <tr key={d.id}>
                  <td>
                    <Link href={`/divers/${d.id}`} className="font-semibold text-navy hover:underline">
                      {d.preferredName || d.legalName}
                    </Link>
                    {d.status !== "active" && <span className="chip chip-mute ml-2">{d.status}</span>}
                    {d.family.status === UNREGISTERED_FAMILY_STATUS && <span className="chip chip-warn ml-2">Not yet registered</span>}
                  </td>
                  <td>{d.primaryGroup ? (
                    <span className={`chip ${d.primaryGroup.colorToken === "orange" ? "chip-accent" : d.primaryGroup.colorToken === "brown" ? "chip-brown" : "chip-navy"}`}>{d.primaryGroup.name}</span>
                  ) : <span className="text-mute">—</span>}</td>
                  <td className="text-sm">{plan?.plan.name ?? <span className="chip chip-warn">No plan</span>}</td>
                  <td>{mem("aau")}</td>
                  <td>{mem("usa_diving")}</td>
                  <td className="text-sm"><Link href={`/families/${d.familyId}`} className="hover:underline">{d.family.billingName}</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
