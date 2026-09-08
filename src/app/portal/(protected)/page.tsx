import { db, tables } from "@/db";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { requireFamily } from "@/lib/server/session";
import { formatLocalTime, toLocalYMD, type YMD } from "@/lib/dates";
import { setRsvp } from "@/app/actions/portal";
import Link from "next/link";

export const metadata = { title: "Practice sign-up" };

function addDaysYMD(ymd: YMD, days: number): YMD {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Sunday that begins the calendar week containing `ymd`. */
function weekStart(ymd: YMD): YMD {
  const dow = new Date(ymd + "T00:00:00Z").getUTCDay();
  return addDaysYMD(ymd, -dow);
}

export default async function PortalHome({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>;
}) {
  const session = await requireFamily();
  const params = await searchParams;
  const weekOffset = Number(params?.week ?? 0) || 0;

  const todayYmd = toLocalYMD(new Date());
  const rangeStart = addDaysYMD(weekStart(todayYmd), weekOffset * 7);
  const rangeEnd = addDaysYMD(rangeStart, 6);

  const divers = await db.query.divers.findMany({
    where: and(eq(tables.divers.familyId, session.familyId), eq(tables.divers.status, "active")),
    with: { primaryGroup: true },
  });

  const groupIds = divers.map((d) => d.primaryGroupId).filter((g): g is string => !!g);

  const practices = groupIds.length
    ? await db.query.practices.findMany({
        where: and(
          eq(tables.practices.clubId, session.clubId),
          gte(tables.practices.practiceDate, rangeStart),
          lte(tables.practices.practiceDate, rangeEnd),
        ),
        with: { facility: true },
        orderBy: (p, { asc }) => [asc(p.startsAt)],
      })
    : [];

  const diverIds = divers.map((d) => d.id);
  const rsvps = diverIds.length
    ? await db.query.practiceRsvps.findMany({
        where: inArray(tables.practiceRsvps.diverId, diverIds),
      })
    : [];
  const rsvpMap = new Map(rsvps.map((r) => [`${r.practiceId}:${r.diverId}`, r.status]));

  const weekLabel = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
  const rangeLabel = `${weekLabel.format(new Date(rangeStart + "T12:00:00Z"))} – ${weekLabel.format(new Date(rangeEnd + "T12:00:00Z"))}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="display text-xl">Practice sign-up</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link className="btn btn-secondary !min-h-9 !px-3" href={`/portal?week=${weekOffset - 1}`}>← Prior week</Link>
          <span className="text-mute">{rangeLabel}</span>
          <Link className="btn btn-secondary !min-h-9 !px-3" href={`/portal?week=${weekOffset + 1}`}>Next week →</Link>
        </div>
      </div>

      {divers.length === 0 && (
        <p className="text-mute">No active divers found on this family account. Contact the club if this looks wrong.</p>
      )}

      {divers.map((diver) => {
        const eligible = practices.filter((p) => {
          const ids = (p.eligibleGroupIds as string[]) ?? [];
          return diver.primaryGroupId && ids.includes(diver.primaryGroupId);
        });
        return (
          <section key={diver.id} className="card p-4">
            <h2 className="font-semibold mb-3">
              {diver.preferredName || diver.legalName}
              {diver.primaryGroup && <span className="text-mute font-normal"> · {diver.primaryGroup.name}</span>}
            </h2>
            {eligible.length === 0 && <p className="text-sm text-mute">No practices scheduled this week.</p>}
            <ul className="divide-y divide-[var(--color-line)]">
              {eligible.map((p) => {
                const status = rsvpMap.get(`${p.id}:${diver.id}`) ?? null;
                const canceled = p.status === "canceled";
                const isPast = new Date(p.startsAt) < new Date();
                return (
                  <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(p.practiceDate + "T12:00:00Z"))}
                        {" · "}
                        {formatLocalTime(new Date(p.startsAt))}–{formatLocalTime(new Date(p.endsAt))}
                      </p>
                      <p className="text-xs text-mute">
                        {p.facility?.name ?? "Facility TBD"}
                        {p.requiresSignup && !canceled && (
                          <span className="chip chip-accent ml-2 !py-0.5">Sign-up required</span>
                        )}
                      </p>
                    </div>
                    {canceled ? (
                      <span className="chip chip-danger">Canceled</span>
                    ) : isPast ? (
                      <span className="chip chip-mute">{status === "attending" ? "Attended" : "Past"}</span>
                    ) : (
                      <div className="flex gap-2">
                        <form action={setRsvp}>
                          <input type="hidden" name="diverId" value={diver.id} />
                          <input type="hidden" name="practiceId" value={p.id} />
                          <input type="hidden" name="status" value="attending" />
                          <input type="hidden" name="weekOffset" value={weekOffset} />
                          <button
                            className={`btn !min-h-9 !px-3 ${status === "attending" ? "btn-primary" : "btn-secondary"}`}
                          >
                            Attending
                          </button>
                        </form>
                        <form action={setRsvp}>
                          <input type="hidden" name="diverId" value={diver.id} />
                          <input type="hidden" name="practiceId" value={p.id} />
                          <input type="hidden" name="status" value="not_attending" />
                          <input type="hidden" name="weekOffset" value={weekOffset} />
                          <button
                            className={`btn !min-h-9 !px-3 ${status === "not_attending" ? "btn-danger" : "btn-secondary"}`}
                          >
                            Can&rsquo;t make it
                          </button>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
