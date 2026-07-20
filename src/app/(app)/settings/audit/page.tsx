import { db, tables } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/session";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireAdmin();
  const { page } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const perPage = 50;

  const events = await db.query.auditEvents.findMany({
    where: eq(tables.auditEvents.clubId, session.clubId),
    orderBy: [desc(tables.auditEvents.createdAt)],
    limit: perPage,
    offset: (pageNum - 1) * perPage,
    with: { actor: { columns: { name: true } } },
  });

  return (
    <div className="space-y-4">
      <p className="hint">
        Every sensitive action — approvals, pricing changes, attendance corrections,
        manual charges, invoice issue/void, account changes — is recorded here and
        can&apos;t be edited or deleted from the app.
      </p>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What happened</th></tr></thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={4} className="text-mute">No audit events yet.</td></tr>}
            {events.map((e) => (
              <tr key={e.id}>
                <td className="text-sm whitespace-nowrap">{e.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" })}</td>
                <td className="text-sm whitespace-nowrap">{e.actor?.name ?? "System"}</td>
                <td className="text-sm"><code>{e.action}</code></td>
                <td className="text-sm">{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        {pageNum > 1 && <a className="btn btn-secondary" href={`/settings/audit?page=${pageNum - 1}`}>Newer</a>}
        {events.length === perPage && <a className="btn btn-secondary" href={`/settings/audit?page=${pageNum + 1}`}>Older</a>}
      </div>
    </div>
  );
}
