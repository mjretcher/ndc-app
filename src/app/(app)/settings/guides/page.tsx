import Link from "next/link";
import { db, tables } from "@/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/session";
import { updateGuide } from "@/app/actions/settings";
import { todayYMD } from "@/lib/dates";

export const metadata = { title: "Membership guides" };

export default async function GuidesSettingsPage() {
  const session = await requireAdmin();
  // Guides not re-verified within ~6 months get flagged.
  const staleCutoff = new Date(Date.parse(todayYMD()) - 180 * 86400000).toISOString().slice(0, 10);
  const guides = await db.query.externalGuides.findMany({
    where: eq(tables.externalGuides.clubId, session.clubId),
    orderBy: [asc(tables.externalGuides.organization)],
  });

  return (
    <div className="space-y-6">
      <p className="hint">
        These are the public instructions families see at{" "}
        <Link href="/guides/aau" className="font-semibold text-navy underline">/guides/aau</Link> and{" "}
        <Link href="/guides/usa-diving" className="font-semibold text-navy underline">/guides/usa-diving</Link>.
        External fees change — re-verify against the official sites periodically and update the
        &ldquo;last verified&rdquo; date so everyone knows how fresh the info is.
      </p>
      {guides.map((g) => {
        const stale = !g.lastVerifiedAt || g.lastVerifiedAt < staleCutoff;
        return (
          <section key={g.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h2 className="display text-lg">{g.organization === "aau" ? "AAU" : "USA Diving"}</h2>
              <span className="chip chip-mute">v{g.version}</span>
              {stale
                ? <span className="chip chip-warn">Verify fees — last checked {g.lastVerifiedAt ?? "never"}</span>
                : <span className="chip chip-ok">Verified {g.lastVerifiedAt}</span>}
            </div>
            <form action={updateGuide} className="grid gap-2">
              <input type="hidden" name="guideId" value={g.id} />
              <div>
                <label className="label" htmlFor={`title-${g.id}`}>Title</label>
                <input id={`title-${g.id}`} name="title" defaultValue={g.title} className="input" />
              </div>
              <div>
                <label className="label" htmlFor={`body-${g.id}`}>Instructions (Markdown)</label>
                <textarea id={`body-${g.id}`} name="bodyMarkdown" rows={14} defaultValue={g.bodyMarkdown} className="input font-mono text-sm" />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {g.organization === "aau" && (
                  <div>
                    <label className="label" htmlFor={`code-${g.id}`}>AAU club code</label>
                    <input id={`code-${g.id}`} name="clubCode" defaultValue={g.clubCode ?? ""} className="input" />
                    {g.clubCode === "CONFIRM-CLUB-CODE" && <p className="hint mt-1 text-warn">Placeholder — replace with the real club code before launch.</p>}
                  </div>
                )}
                <div>
                  <label className="label" htmlFor={`ver-${g.id}`}>Last verified</label>
                  <input id={`ver-${g.id}`} name="lastVerifiedAt" type="date" defaultValue={g.lastVerifiedAt ?? todayYMD()} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor={`by-${g.id}`}>Verified by</label>
                  <input id={`by-${g.id}`} name="verifiedBy" defaultValue={g.verifiedBy ?? ""} className="input" />
                </div>
              </div>
              <button className="btn btn-primary">Save {g.organization === "aau" ? "AAU" : "USA Diving"} guide</button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
