import { db, tables } from "@/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { todayYMD } from "@/lib/dates";
import { setWeeklyAvailability, setAvailabilityException, removeAvailabilityException } from "@/app/actions/availability";

export const metadata = { title: "Availability" };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function AvailabilityPage() {
  const session = await requireCoach();
  const isAdmin = session.role === "owner_admin";
  const today = todayYMD();

  const memberships = await db.query.clubMemberships.findMany({
    where: and(
      eq(tables.clubMemberships.clubId, session.clubId),
      eq(tables.clubMemberships.active, true),
      inArray(tables.clubMemberships.role, ["owner_admin", "coach"]),
    ),
    with: { user: true },
  });
  // A plain coach only ever sees their own card.
  const visibleCoaches = isAdmin ? memberships : memberships.filter((m) => m.userId === session.userId);
  const coachUserIds = visibleCoaches.map((m) => m.userId);

  const [weeklyRows, exceptionRows] = await Promise.all([
    coachUserIds.length
      ? db.query.coachWeeklyAvailability.findMany({ where: inArray(tables.coachWeeklyAvailability.userId, coachUserIds) })
      : Promise.resolve([]),
    coachUserIds.length
      ? db.query.coachAvailabilityExceptions.findMany({
          where: and(inArray(tables.coachAvailabilityExceptions.userId, coachUserIds), gte(tables.coachAvailabilityExceptions.date, today)),
          orderBy: (e, { asc }) => [asc(e.date)],
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <p className="eyebrow">Coverage</p>
        <h1 className="display text-2xl md:text-3xl">Availability</h1>
        <p className="text-sm text-mute mt-1">
          Set the days you generally coach, plus any specific dates you can&apos;t make it. Practices
          you&apos;re assigned to that conflict with this will show a warning on the calendar.
        </p>
      </header>

      {visibleCoaches.map((coach) => {
        const weeklyForCoach = new Map(
          weeklyRows.filter((r) => r.userId === coach.userId).map((r) => [r.weekday, r.available]),
        );
        const exceptionsForCoach = exceptionRows.filter((e) => e.userId === coach.userId);

        return (
          <section key={coach.userId} className="card p-4 space-y-4">
            <h2 className="font-semibold">
              {coach.user.name}
              {coach.userId === session.userId && <span className="text-mute font-normal"> (you)</span>}
            </h2>

            <div>
              <p className="label mb-2">Weekly pattern</p>
              <ul className="space-y-1.5">
                {WEEKDAY_NAMES.map((name, weekday) => {
                  const state = weeklyForCoach.has(weekday) ? (weeklyForCoach.get(weekday) ? "available" : "unavailable") : "unset";
                  return (
                    <li key={weekday} className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0">{name}</span>
                      <form action={setWeeklyAvailability}>
                        <input type="hidden" name="userId" value={coach.userId} />
                        <input type="hidden" name="weekday" value={weekday} />
                        <input type="hidden" name="available" value="true" />
                        <button className={`btn !min-h-8 !py-1 text-xs ${state === "available" ? "btn-primary" : "btn-secondary"}`}>
                          Available
                        </button>
                      </form>
                      <form action={setWeeklyAvailability}>
                        <input type="hidden" name="userId" value={coach.userId} />
                        <input type="hidden" name="weekday" value={weekday} />
                        <input type="hidden" name="available" value="false" />
                        <button className={`btn !min-h-8 !py-1 text-xs ${state === "unavailable" ? "btn-danger" : "btn-secondary"}`}>
                          Not available
                        </button>
                      </form>
                      {state !== "unset" && (
                        <form action={setWeeklyAvailability}>
                          <input type="hidden" name="userId" value={coach.userId} />
                          <input type="hidden" name="weekday" value={weekday} />
                          <input type="hidden" name="available" value="clear" />
                          <button className="text-xs text-mute underline">clear</button>
                        </form>
                      )}
                      {state === "unset" && <span className="text-xs text-mute">No preference — assumed available</span>}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="label mb-2">Upcoming exceptions</p>
              {exceptionsForCoach.length === 0 && <p className="text-sm text-mute mb-2">None set.</p>}
              <ul className="space-y-1.5 mb-3">
                {exceptionsForCoach.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <span className={`chip ${e.available ? "chip-ok" : "chip-danger"}`}>
                      {e.date} — {e.available ? "Available" : "Unavailable"}
                    </span>
                    {e.note && <span className="text-mute">{e.note}</span>}
                    <form action={removeAvailabilityException} className="ml-auto">
                      <input type="hidden" name="userId" value={coach.userId} />
                      <input type="hidden" name="exceptionId" value={e.id} />
                      <button className="text-xs text-mute underline">remove</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={setAvailabilityException} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="userId" value={coach.userId} />
                <div>
                  <label className="label" htmlFor={`date-${coach.userId}`}>Date</label>
                  <input id={`date-${coach.userId}`} name="date" type="date" min={today} required className="input !min-h-9" />
                </div>
                <select name="available" className="input !min-h-9 !w-auto" defaultValue="false" aria-label="Availability">
                  <option value="false">Unavailable</option>
                  <option value="true">Available</option>
                </select>
                <input name="note" placeholder="Note (optional)" className="input !min-h-9 !w-40" />
                <button className="btn btn-secondary !min-h-9">Add</button>
              </form>
            </div>
          </section>
        );
      })}
    </div>
  );
}
