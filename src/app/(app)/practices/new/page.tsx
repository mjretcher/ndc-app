import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, asc, inArray } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { createPracticeSeries, createOneOffPractice } from "@/app/actions/practices";
import { todayYMD } from "@/lib/dates";

export const metadata = { title: "New practice" };

export default async function NewPracticePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireCoach();
  const { tab } = await searchParams;
  const isOneOff = tab === "oneoff";
  const today = todayYMD();

  const facilities = await db.query.facilities.findMany({
    where: and(eq(tables.facilities.clubId, session.clubId), eq(tables.facilities.active, true)),
  });
  const groups = await db.query.groups.findMany({
    where: and(eq(tables.groups.clubId, session.clubId), eq(tables.groups.active, true)),
    orderBy: [asc(tables.groups.sortOrder)],
  });
  const coaches = await db.query.clubMemberships.findMany({
    where: and(
      eq(tables.clubMemberships.clubId, session.clubId),
      eq(tables.clubMemberships.active, true),
      inArray(tables.clubMemberships.role, ["owner_admin", "coach"]),
    ),
    with: { user: true },
  });

  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div className="space-y-5 max-w-2xl">
      <header>
        <Link href="/calendar" className="text-sm text-mute hover:text-navy">← Calendar</Link>
        <h1 className="display text-2xl md:text-3xl mt-1">New practice</h1>
      </header>

      <div className="flex gap-2" role="tablist">
        <Link role="tab" aria-selected={!isOneOff} href="/practices/new"
          className={`btn ${!isOneOff ? "btn-primary" : "btn-secondary"}`}>Recurring series</Link>
        <Link role="tab" aria-selected={isOneOff} href="/practices/new?tab=oneoff"
          className={`btn ${isOneOff ? "btn-primary" : "btn-secondary"}`}>One-off / clinic</Link>
      </div>

      {!isOneOff ? (
        <form action={createPracticeSeries} className="card p-4 md:p-5 space-y-4">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" required placeholder="Evening practice" className="input" />
          </div>
          <fieldset>
            <legend className="label">Repeats on</legend>
            <div className="flex flex-wrap gap-2">
              {weekdayNames.map((name, i) => (
                <label key={i} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                  <input type="checkbox" name="weekdays" value={i} defaultChecked={i >= 1 && i <= 4} />
                  {name.slice(0, 3)}
                </label>
              ))}
            </div>
            <p className="hint mt-1">Tip: put Sunday practices in their own series so Sunday pricing applies cleanly.</p>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="startTime">Starts</label>
              <input id="startTime" name="startTime" type="time" defaultValue="17:30" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="endTime">Ends</label>
              <input id="endTime" name="endTime" type="time" defaultValue="19:30" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="rangeStart">From</label>
              <input id="rangeStart" name="rangeStart" type="date" defaultValue={today} required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="rangeEnd">Through</label>
              <input id="rangeEnd" name="rangeEnd" type="date" required className="input" />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="facility">Facility</label>
              <select id="facility" name="facilityId" className="input">
                {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="">TBD</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="category">Billing category</label>
              <select id="category" name="category" className="input" defaultValue="weekday">
                <option value="weekday">Weekday practice</option>
                <option value="saturday">Saturday practice (billed at Sunday rate)</option>
                <option value="sunday">Sunday practice</option>
                <option value="clinic">Clinic</option>
                <option value="non_billable">Non-billable</option>
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="label">Who&apos;s eligible</legend>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                  <input type="checkbox" name="groupIds" value={g.id} defaultChecked />
                  {g.name}
                </label>
              ))}
            </div>
            <p className="hint mt-1">Unchecked = that group won&apos;t appear on the attendance roster.</p>
          </fieldset>
          <fieldset>
            <legend className="label">Assigned coaches</legend>
            <div className="flex flex-wrap gap-2">
              {coaches.map((c) => (
                <label key={c.userId} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                  <input type="checkbox" name="coachIds" value={c.userId} />
                  {c.user.name}
                </label>
              ))}
            </div>
            {coaches.length === 0 && <p className="hint mt-1">No active coach accounts found.</p>}
          </fieldset>
          <div>
            <label className="label" htmlFor="notes">Internal notes</label>
            <textarea id="notes" name="notes" rows={2} className="input" />
          </div>
          <button className="btn btn-primary w-full">Create series</button>
        </form>
      ) : (
        <form action={createOneOffPractice} className="card p-4 md:p-5 space-y-4">
          <div>
            <label className="label" htmlFor="otitle">Title</label>
            <input id="otitle" name="title" required placeholder="Saturday clinic — entries" className="input" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="odate">Date</label>
              <input id="odate" name="date" type="date" defaultValue={today} required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="ostart">Starts</label>
              <input id="ostart" name="startTime" type="time" defaultValue="10:00" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="oend">Ends</label>
              <input id="oend" name="endTime" type="time" defaultValue="12:00" required className="input" />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="ofacility">Facility</label>
              <select id="ofacility" name="facilityId" className="input">
                {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="">TBD</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ocategory">Billing category</label>
              <select id="ocategory" name="category" className="input" defaultValue="clinic">
                <option value="clinic">Clinic</option>
                <option value="weekday">Weekday practice</option>
                <option value="saturday">Saturday practice (billed at Sunday rate)</option>
                <option value="sunday">Sunday practice</option>
                <option value="non_billable">Non-billable</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ocap">Capacity (optional)</label>
              <input id="ocap" name="capacity" type="number" min="1" className="input" />
            </div>
          </div>
          <fieldset>
            <legend className="label">Who&apos;s eligible</legend>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                  <input type="checkbox" name="groupIds" value={g.id} defaultChecked />
                  {g.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Assigned coaches</legend>
            <div className="flex flex-wrap gap-2">
              {coaches.map((c) => (
                <label key={c.userId} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                  <input type="checkbox" name="coachIds" value={c.userId} />
                  {c.user.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="odesc">Description for families (optional)</label>
            <textarea id="odesc" name="publicDescription" rows={2} className="input" placeholder="What to bring, focus of the clinic…" />
          </div>
          <button className="btn btn-primary w-full">Create practice</button>
        </form>
      )}
    </div>
  );
}
