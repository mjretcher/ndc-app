import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { updatePractice, cancelPractice } from "@/app/actions/practices";
import { formatLocalDate, type YMD } from "@/lib/dates";

export const metadata = { title: "Edit practice" };

function localTimeOf(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York",
  }).format(d);
}

export default async function EditPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCoach();
  const { id } = await params;

  const practice = await db.query.practices.findFirst({
    where: and(eq(tables.practices.id, id), eq(tables.practices.clubId, session.clubId)),
  });
  if (!practice) notFound();

  const facilities = await db.query.facilities.findMany({
    where: and(eq(tables.facilities.clubId, session.clubId), eq(tables.facilities.active, true)),
  });
  const coaches = await db.query.clubMemberships.findMany({
    where: and(
      eq(tables.clubMemberships.clubId, session.clubId),
      eq(tables.clubMemberships.active, true),
      inArray(tables.clubMemberships.role, ["owner_admin", "coach"]),
    ),
    with: { user: true },
  });
  const assignedCoaches = await db.query.practiceCoaches.findMany({
    where: eq(tables.practiceCoaches.practiceId, practice.id),
  });
  const assignedCoachIds = new Set(assignedCoaches.map((a) => a.userId));
  const inSeries = practice.seriesId != null;

  return (
    <div className="space-y-5 max-w-2xl">
      <header>
        <Link href={`/practices/${id}`} className="text-sm text-mute hover:text-navy">← {practice.title}</Link>
        <h1 className="display text-2xl md:text-3xl mt-1">Edit practice</h1>
        <p className="text-sm text-mute">{formatLocalDate(practice.practiceDate as YMD)}</p>
      </header>

      <form action={updatePractice} className="card p-4 md:p-5 space-y-4">
        <input type="hidden" name="practiceId" value={practice.id} />
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" defaultValue={practice.title} className="input" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input id="date" name="date" type="date" defaultValue={practice.practiceDate} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="startTime">Starts</label>
            <input id="startTime" name="startTime" type="time" defaultValue={localTimeOf(practice.startsAt)} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="endTime">Ends</label>
            <input id="endTime" name="endTime" type="time" defaultValue={localTimeOf(practice.endsAt)} required className="input" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="facility">Facility</label>
            <select id="facility" name="facilityId" defaultValue={practice.facilityId ?? ""} className="input">
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              <option value="">TBD</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="category">Billing category</label>
            <select id="category" name="category" defaultValue={practice.category} className="input">
              <option value="weekday">Weekday practice</option>
              <option value="saturday">Saturday practice (billed at Sunday rate)</option>
              <option value="sunday">Sunday practice</option>
              <option value="clinic">Clinic</option>
              <option value="non_billable">Non-billable</option>
            </select>
            <p className="hint mt-1">Changing this re-prices any charges already created from attendance.</p>
          </div>
        </div>
        <fieldset>
          <legend className="label">Assigned coaches</legend>
          <input type="hidden" name="coachesFieldPresent" value="1" />
          <div className="flex flex-wrap gap-2">
            {coaches.map((c) => (
              <label key={c.userId} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                <input type="checkbox" name="coachIds" value={c.userId} defaultChecked={assignedCoachIds.has(c.userId)} />
                {c.user.name}
              </label>
            ))}
          </div>
          {inSeries && <p className="hint mt-1">Applies to whichever practices the scope below covers.</p>}
        </fieldset>
        {inSeries && (
          <fieldset>
            <legend className="label">Apply changes to</legend>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                <input type="radio" name="scope" value="one" defaultChecked /> Just this practice
              </label>
              <label className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                <input type="radio" name="scope" value="future" /> This &amp; all future in series
              </label>
              <label className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-navy has-checked:bg-pool cursor-pointer">
                <input type="radio" name="scope" value="all" /> Entire series
              </label>
            </div>
            <p className="hint mt-1">Date changes only ever move this one practice; time/place/category follow the scope.</p>
          </fieldset>
        )}
        <div>
          <label className="label" htmlFor="changeSummary">What changed? (goes in the email)</label>
          <input id="changeSummary" name="changeSummary" placeholder="Moved to 6pm because of a swim meet" className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="notify" defaultChecked className="h-5 w-5" />
          Email affected families about this change
        </label>
        <button className="btn btn-primary w-full">Save changes</button>
      </form>

      <form action={cancelPractice} className="card p-4 md:p-5 space-y-3 border-danger/40">
        <input type="hidden" name="practiceId" value={practice.id} />
        <h2 className="display text-lg text-danger">Cancel practice</h2>
        {inSeries && (
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-danger has-checked:bg-danger-soft cursor-pointer">
              <input type="radio" name="scope" value="one" defaultChecked /> Just this one
            </label>
            <label className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-danger has-checked:bg-danger-soft cursor-pointer">
              <input type="radio" name="scope" value="future" /> This &amp; future
            </label>
          </div>
        )}
        <input name="reason" placeholder="Reason (goes in the email)" className="input" />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="notify" defaultChecked className="h-5 w-5" />
          Email affected families
        </label>
        <button className="btn btn-danger">Cancel practice</button>
        <p className="hint">Any charges already created from attendance at canceled practices are automatically reversed.</p>
      </form>
    </div>
  );
}
