import { db, tables } from "@/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/session";
import { updateTemplate, retryNotifications } from "@/app/actions/settings";

export const metadata = { title: "Notifications" };

const eventLabels: Record<string, string> = {
  registration_received: "Registration received",
  registration_approved: "Registration approved",
  registration_followup: "Registration needs more info",
  membership_missing: "Membership missing / expiring",
  practice_changed: "Practice changed",
  practice_canceled: "Practice canceled",
  invoice_issued: "Invoice issued",
  invoice_delivery_failed: "Invoice delivery failure (admin alert)",
};

export default async function NotificationsSettingsPage() {
  const session = await requireAdmin();
  const templates = await db.query.notificationTemplates.findMany({
    where: eq(tables.notificationTemplates.clubId, session.clubId),
    orderBy: [asc(tables.notificationTemplates.eventType)],
  });
  const jobs = await db.query.notificationJobs.findMany({
    where: eq(tables.notificationJobs.clubId, session.clubId),
    orderBy: [desc(tables.notificationJobs.createdAt)],
    limit: 40,
  });
  const failed = jobs.filter((j) => j.status === "failed").length;
  const skipped = jobs.filter((j) => j.status === "skipped").length;
  const emailConfigured = !!process.env.RESEND_API_KEY;

  return (
    <div className="space-y-6">
      {!emailConfigured && (
        <section className="card p-4 border-warn bg-warn-soft">
          <h2 className="font-semibold text-warn">No email provider connected yet</h2>
          <p className="text-sm mt-1">
            Every email below — registration confirmations, membership reminders, invoice notices,
            practice cancellations — is being <strong>logged but not actually sent</strong>. Nothing has
            gone out to a real inbox. Connect an email provider to start sending for real.
          </p>
        </section>
      )}
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="display text-lg">Send log</h2>
          {failed > 0 && (
            <form action={async () => { "use server"; await retryNotifications(); }}>
              <button className="btn btn-secondary !min-h-9">Retry {failed} failed</button>
            </form>
          )}
        </div>
        {skipped > 0 && (
          <p className="text-xs text-mute mb-2">{skipped} of the entries below were skipped — no provider was configured at send time.</p>
        )}
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>When</th><th>Event</th><th>To</th><th>Status</th><th>Attempts</th></tr></thead>
            <tbody>
              {jobs.length === 0 && <tr><td colSpan={5} className="text-mute">No emails sent yet.</td></tr>}
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="text-sm whitespace-nowrap">{j.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" })}</td>
                  <td className="text-sm">{eventLabels[j.eventType] ?? j.eventType}</td>
                  <td className="text-sm">{j.recipientEmail}</td>
                  <td><span className={`chip ${j.status === "sent" ? "chip-ok" : j.status === "failed" ? "chip-danger" : j.status === "skipped" ? "chip-mute" : "chip-warn"}`}>{j.status}</span></td>
                  <td className="text-sm">{j.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="display text-lg">Templates</h2>
          <p className="hint">
            Merge fields like <code>{"{{guardian_name}}"}</code> are replaced when the email sends.
            Unknown fields are left blank. Medical details are never available as merge fields.
          </p>
        </div>
        {templates.map((t) => (
          <details key={t.id} className="card p-4">
            <summary className="font-semibold cursor-pointer flex items-center gap-2">
              {eventLabels[t.eventType] ?? t.eventType}
              {!t.active && <span className="chip chip-mute">Disabled</span>}
            </summary>
            <form action={updateTemplate} className="mt-3 grid gap-2">
              <input type="hidden" name="templateId" value={t.id} />
              <div>
                <label className="label" htmlFor={`subj-${t.id}`}>Subject</label>
                <input id={`subj-${t.id}`} name="subject" defaultValue={t.subject} className="input" />
              </div>
              <div>
                <label className="label" htmlFor={`body-${t.id}`}>Body</label>
                <textarea id={`body-${t.id}`} name="body" rows={8} defaultValue={t.body} className="input font-mono text-sm" />
              </div>
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" name="active" defaultChecked={t.active} /> Active (unchecked = this event sends nothing)
              </label>
              <button className="btn btn-primary">Save template</button>
            </form>
          </details>
        ))}
      </section>
    </div>
  );
}
