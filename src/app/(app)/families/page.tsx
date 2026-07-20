import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, ilike, asc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";

export const metadata = { title: "Families" };

export default async function FamiliesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireCoach();
  const { q } = await searchParams;

  const rows = await db.query.families.findMany({
    where: q
      ? and(eq(tables.families.clubId, session.clubId), ilike(tables.families.billingName, `%${q}%`))
      : eq(tables.families.clubId, session.clubId),
    with: { divers: { with: { primaryGroup: true } }, guardians: true },
    orderBy: [asc(tables.families.billingName)],
    limit: 200,
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="display text-2xl md:text-3xl">Families</h1>
        </div>
        <form className="flex gap-2" action="/families">
          <label htmlFor="q" className="sr-only">Search families</label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Search by family name" className="input !w-56" />
          <button className="btn btn-secondary">Search</button>
        </form>
      </header>

      {rows.length === 0 ? (
        <div className="card p-6 text-mute">
          {q ? <>No families match “{q}”.</> : <>No families yet. Approve a registration to create the first one.</>}
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((f) => {
            const primary = f.guardians.find((g) => g.isPrimary) ?? f.guardians[0];
            return (
              <li key={f.id}>
                <Link href={`/families/${f.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-paper">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{f.billingName}</p>
                    <p className="text-sm text-mute truncate">
                      {f.divers.map((d) => d.preferredName || d.legalName).join(", ") || "No divers"}
                      {primary?.email ? ` · ${primary.email}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {f.divers.map((d) => d.primaryGroup && (
                      <span key={d.id} className={`chip ${d.primaryGroup.colorToken === "orange" ? "chip-accent" : d.primaryGroup.colorToken === "brown" ? "chip-brown" : "chip-navy"}`}>
                        {d.primaryGroup.name}
                      </span>
                    ))}
                  </div>
                  {f.status !== "active" && <span className="chip chip-mute">{f.status}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
