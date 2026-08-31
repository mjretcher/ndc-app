import { db, tables } from "@/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/session";
import { upsertCoach, deactivateCoach } from "@/app/actions/settings";
import { PasswordInput } from "@/components/PasswordInput";

export const metadata = { title: "Coaches" };

export default async function UsersSettingsPage() {
  const session = await requireAdmin();
  const memberships = await db.query.clubMemberships.findMany({
    where: eq(tables.clubMemberships.clubId, session.clubId),
    with: { user: true },
  });
  const rows = memberships.sort((a, b) => a.user.name.localeCompare(b.user.name));

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <h2 className="display text-lg mb-3">Coach accounts</h2>
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="rounded-lg border border-line p-3">
              <form action={upsertCoach} className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto] items-center">
                <input type="hidden" name="userId" value={m.userId} />
                <input name="name" defaultValue={m.user.name} className="input" aria-label="Name" />
                <input name="email" type="email" defaultValue={m.user.email} className="input" aria-label="Email" />
                <select name="role" defaultValue={m.role} className="input !w-auto" aria-label="Role"
                  disabled={m.userId === session.userId}>
                  <option value="coach">Coach</option>
                  <option value="owner_admin">Owner / admin</option>
                </select>
                {m.userId === session.userId && <input type="hidden" name="role" value={m.role} />}
                <label className="text-sm flex items-center gap-1.5">
                  <input type="checkbox" name="active" defaultChecked={m.user.active} disabled={m.userId === session.userId} /> Active
                </label>
                <button className="btn btn-secondary !min-h-9">Save</button>
                <PasswordInput name="password" placeholder="Set new password (leave blank to keep)" wrapperClassName="md:col-span-3" aria-label="New password" autoComplete="new-password" />
                <div className="md:col-span-2 flex justify-end">
                  {m.userId !== session.userId && m.user.active && (
                    <button formAction={deactivateCoach} className="text-sm text-danger font-semibold">Deactivate account</button>
                  )}
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="display text-lg mb-1">Add a coach</h2>
        <p className="hint mb-3">
          Coaches can run practices, attendance, and registrations. Only owner/admins
          can change pricing, issue invoices, or manage accounts.
        </p>
        <form action={upsertCoach} className="grid gap-2 md:grid-cols-2">
          <input name="name" required placeholder="Full name" className="input" aria-label="Name" />
          <input name="email" required type="email" placeholder="Email (used to sign in)" className="input" aria-label="Email" />
          <select name="role" className="input" aria-label="Role">
            <option value="coach">Coach</option>
            <option value="owner_admin">Owner / admin</option>
          </select>
          <PasswordInput name="password" required placeholder="Initial password" aria-label="Initial password" autoComplete="new-password" />
          <button className="btn btn-primary md:col-span-2">Add coach</button>
        </form>
      </section>
    </div>
  );
}
