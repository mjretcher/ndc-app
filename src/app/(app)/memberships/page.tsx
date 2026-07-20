import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, asc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { todayYMD, addDaysYMD } from "@/lib/dates";
import { sendMembershipReminder } from "@/app/actions/families";

export const metadata = { title: "Memberships" };

type MemState = "missing" | "expired" | "expiring" | "pending" | "verified";

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const session = await requireCoach();
  const { filter } = await searchParams;
  const today = todayYMD();
  const soon = addDaysYMD(today, 30);

  const divers = await db.query.divers.findMany({
    where: and(eq(tables.divers.clubId, session.clubId), eq(tables.divers.status, "active")),
    with: { memberships: true, family: { with: { guardians: true } }, primaryGroup: true },
    orderBy: [asc(tables.divers.legalName)],
  });

  const stateOf = (d: (typeof divers)[number], org: "aau" | "usa_diving"): { state: MemState; detail: string } => {
    const m = d.memberships.find((x) => x.organization === org);
    if (!m || m.verification === "missing") return { state: "missing", detail: "No membership on file" };
    if (m.verification === "expired" || (m.expirationDate && m.expirationDate < today)) {
      return { state: "expired", detail: m.expirationDate ? `Expired ${m.expirationDate}` : "Marked expired" };
    }
    if (m.expirationDate && m.expirationDate <= soon) return { state: "expiring", detail: `Expires ${m.expirationDate}` };
    if (m.verification === "pending") return { state: "pending", detail: `#${m.membershipNumber ?? "?"} — not yet verified` };
    return { state: "verified", detail: m.expirationDate ? `Good through ${m.expirationDate}` : "Verified" };
  };

  const chip = (s: MemState) =>
    s === "verified" ? "chip-ok" : s === "pending" ? "chip-warn" : s === "expiring" ? "chip-warn" : "chip-danger";

  const rows = divers.map((d) => ({
    diver: d,
    aau: stateOf(d, "aau"),
    usa: stateOf(d, "usa_diving"),
  }));

  const problems = rows.filter((r) => r.aau.state !== "verified" || r.usa.state !== "verified");
  const shown = filter === "all" ? rows : problems;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1 className="display text-2xl md:text-3xl">Memberships</h1>
          <p className="text-sm text-mute mt-1">
            {problems.length === 0
              ? "Every active diver is fully covered. Nice."
              : `${problems.length} of ${rows.length} active divers need AAU or USA Diving attention.`}
          </p>
        </div>
        <Link href={filter === "all" ? "/memberships" : "/memberships?filter=all"} className="btn btn-secondary">
          {filter === "all" ? "Show problems only" : "Show everyone"}
        </Link>
      </header>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr><th>Diver</th><th>Group</th><th>AAU</th><th>USA Diving</th><th className="w-40">Nudge family</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={5} className="text-mute p-5">Nothing needs attention right now.</td></tr>
            )}
            {shown.map(({ diver, aau, usa }) => {
              const hasEmail = diver.family.guardians.some((g) => g.email);
              return (
                <tr key={diver.id}>
                  <td>
                    <Link href={`/divers/${diver.id}`} className="font-semibold text-navy hover:underline">
                      {diver.preferredName || diver.legalName}
                    </Link>
                    <span className="block text-xs text-mute">{diver.family.billingName}</span>
                  </td>
                  <td className="text-sm">{diver.primaryGroup?.name ?? "—"}</td>
                  <td>
                    <span className={`chip ${chip(aau.state)}`}>{aau.state}</span>
                    <span className="block text-xs text-mute mt-0.5">{aau.detail}</span>
                  </td>
                  <td>
                    <span className={`chip ${chip(usa.state)}`}>{usa.state}</span>
                    <span className="block text-xs text-mute mt-0.5">{usa.detail}</span>
                  </td>
                  <td>
                    {hasEmail ? (
                      <div className="flex flex-col gap-1">
                        {aau.state !== "verified" && (
                          <form action={sendMembershipReminder}>
                            <input type="hidden" name="diverId" value={diver.id} />
                            <input type="hidden" name="organization" value="aau" />
                            <button className="text-xs font-semibold text-accent hover:underline">Email AAU guide</button>
                          </form>
                        )}
                        {usa.state !== "verified" && (
                          <form action={sendMembershipReminder}>
                            <input type="hidden" name="diverId" value={diver.id} />
                            <input type="hidden" name="organization" value="usa_diving" />
                            <button className="text-xs font-semibold text-accent hover:underline">Email USA Diving guide</button>
                          </form>
                        )}
                      </div>
                    ) : <span className="text-xs text-mute">No email on file</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint">
        Families get a friendly email linking to the club&apos;s step-by-step guide
        (<Link className="underline" href="/guides/aau" target="_blank">AAU</Link> /{" "}
        <Link className="underline" href="/guides/usa-diving" target="_blank">USA Diving</Link>).
        Once they reply with a number, verify it on the diver&apos;s page.
      </p>
    </div>
  );
}
