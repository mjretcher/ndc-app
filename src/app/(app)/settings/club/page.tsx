import { db, tables } from "@/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/session";
import { upsertGroup, upsertFacility, updateClub, setEligibilityMode } from "@/app/actions/settings";

export const metadata = { title: "Club settings" };

export default async function ClubSettingsPage() {
  const session = await requireAdmin();
  const club = await db.query.clubs.findFirst({ where: eq(tables.clubs.id, session.clubId) });
  const groups = await db.query.groups.findMany({
    where: eq(tables.groups.clubId, session.clubId),
    orderBy: [asc(tables.groups.sortOrder)],
  });
  const facilities = await db.query.facilities.findMany({
    where: eq(tables.facilities.clubId, session.clubId),
    orderBy: [asc(tables.facilities.name)],
  });
  const rule = await db.query.eligibilityRules.findFirst({
    where: eq(tables.eligibilityRules.clubId, session.clubId),
  });

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <h2 className="display text-lg mb-3">Club info &amp; invoicing</h2>
        <form action={updateClub} className="grid gap-2 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="contactEmail">Contact email</label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={club?.contactEmail ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="contactPhone">Contact phone</label>
            <input id="contactPhone" name="contactPhone" type="tel" defaultValue={club?.contactPhone ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="invoicePrefix">Invoice number prefix</label>
            <input id="invoicePrefix" name="invoicePrefix" defaultValue={club?.invoicePrefix ?? "NDC"} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="invoiceTerms">Invoice terms (printed on every PDF)</label>
            <textarea id="invoiceTerms" name="invoiceTerms" rows={3} defaultValue={club?.invoiceTerms ?? ""} className="input"
              placeholder="Payment due within 14 days. Pay by check or cash at practice…" />
          </div>
          <button className="btn btn-primary md:col-span-2">Save club settings</button>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="display text-lg mb-1">Membership eligibility</h2>
        <p className="hint mb-3">
          Controls how missing AAU / USA Diving memberships affect attendance:
          off = ignore, warn = show a flag on the roster (recommended), enforce
          is reserved for later.
        </p>
        <form action={setEligibilityMode} className="flex flex-wrap items-center gap-2">
          <select name="mode" defaultValue={rule?.mode ?? "warn"} className="input !w-auto" aria-label="Eligibility mode">
            <option value="off">Off</option>
            <option value="warn">Warn (recommended)</option>
            <option value="enforce">Enforce</option>
          </select>
          <button className="btn btn-secondary">Save</button>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="display text-lg mb-3">Groups</h2>
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.id}>
              <form action={upsertGroup} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="groupId" value={g.id} />
                <input name="name" defaultValue={g.name} className="input !w-52" aria-label="Group name" />
                <select name="colorToken" defaultValue={g.colorToken ?? ""} className="input !w-auto" aria-label="Color">
                  <option value="">Navy</option>
                  <option value="orange">Orange</option>
                  <option value="brown">Brown</option>
                </select>
                <input name="sortOrder" type="number" defaultValue={g.sortOrder} className="input !w-20" aria-label="Sort order" />
                <label className="text-sm flex items-center gap-1.5">
                  <input type="checkbox" name="active" defaultChecked={g.active} /> Active
                </label>
                <button className="btn btn-secondary !min-h-9">Save</button>
              </form>
            </li>
          ))}
        </ul>
        <details className="mt-4">
          <summary className="text-sm font-semibold text-navy cursor-pointer">Add a group</summary>
          <form action={upsertGroup} className="mt-2 flex flex-wrap items-center gap-2">
            <input name="name" required placeholder="Group name" className="input !w-52" aria-label="New group name" />
            <select name="colorToken" className="input !w-auto" aria-label="Color">
              <option value="">Navy</option>
              <option value="orange">Orange</option>
              <option value="brown">Brown</option>
            </select>
            <input name="sortOrder" type="number" defaultValue={groups.length + 1} className="input !w-20" aria-label="Sort order" />
            <button className="btn btn-primary !min-h-9">Add group</button>
          </form>
        </details>
      </section>

      <section className="card p-4">
        <h2 className="display text-lg mb-3">Facilities</h2>
        <ul className="space-y-3">
          {facilities.map((f) => (
            <li key={f.id}>
              <form action={upsertFacility} className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto] items-center">
                <input type="hidden" name="facilityId" value={f.id} />
                <input name="name" defaultValue={f.name} className="input" aria-label="Facility name" />
                <input name="address" defaultValue={f.address ?? ""} placeholder="Address" className="input" aria-label="Address" />
                <label className="text-sm flex items-center gap-1.5">
                  <input type="checkbox" name="active" defaultChecked={f.active} /> Active
                </label>
                <button className="btn btn-secondary !min-h-9">Save</button>
                <input name="entryNotes" defaultValue={f.entryNotes ?? ""} placeholder="Entry notes for families (doors, parking…)" className="input md:col-span-4" aria-label="Entry notes" />
              </form>
            </li>
          ))}
        </ul>
        <details className="mt-4">
          <summary className="text-sm font-semibold text-navy cursor-pointer">Add a facility</summary>
          <form action={upsertFacility} className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input name="name" required placeholder="Facility name" className="input" aria-label="New facility name" />
            <input name="address" placeholder="Address" className="input" aria-label="Address" />
            <button className="btn btn-primary !min-h-9">Add facility</button>
          </form>
        </details>
      </section>
    </div>
  );
}
