import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, desc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import type { RegistrationPayload } from "@/lib/registration-schema";

export const metadata = { title: "Registrations" };

const statusChip: Record<string, { cls: string; label: string }> = {
  pending: { cls: "chip-accent", label: "Pending" },
  needs_followup: { cls: "chip-warn", label: "Waiting on family" },
  approved: { cls: "chip-ok", label: "Approved" },
  rejected: { cls: "chip-mute", label: "Rejected" },
};

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const session = await requireCoach();
  const { show } = await searchParams;
  const showAll = show === "all";

  const submissions = await db.query.registrationSubmissions.findMany({
    where: showAll
      ? eq(tables.registrationSubmissions.clubId, session.clubId)
      : and(
          eq(tables.registrationSubmissions.clubId, session.clubId),
          eq(tables.registrationSubmissions.status, "pending"),
        ),
    orderBy: [desc(tables.registrationSubmissions.submittedAt)],
    limit: 100,
  });
  const followups = showAll ? [] : await db.query.registrationSubmissions.findMany({
    where: and(
      eq(tables.registrationSubmissions.clubId, session.clubId),
      eq(tables.registrationSubmissions.status, "needs_followup"),
    ),
    orderBy: [desc(tables.registrationSubmissions.submittedAt)],
  });
  const rows = [...submissions, ...followups];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Intake</p>
          <h1 className="display text-2xl md:text-3xl">Registrations</h1>
        </div>
        <Link href={showAll ? "/registrations" : "/registrations?show=all"} className="btn btn-secondary">
          {showAll ? "Show open only" : "Show all"}
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="card p-6 text-mute">
          The review queue is empty. New submissions from the public form at <code className="font-semibold">/register</code> land here.
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((s) => {
            const p = s.payload as RegistrationPayload;
            const chip = statusChip[s.status];
            return (
              <li key={s.id}>
                <Link href={`/registrations/${s.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-paper">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{p.family.billingName}</p>
                    <p className="text-sm text-mute truncate">
                      {p.divers.map((d) => d.preferredName || d.legalName).join(", ")}
                      {" · "}{p.guardians[0]?.email}
                    </p>
                  </div>
                  <span className={`chip ${chip.cls}`}>{chip.label}</span>
                  <time className="text-sm text-mute" dateTime={s.submittedAt.toISOString()}>
                    {s.submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
