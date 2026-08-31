import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { formatLocalDate, formatLocalTime, type YMD } from "@/lib/dates";
import { restorePractice } from "@/app/actions/practices";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Practice" };

export default async function PracticeDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCoach();
  const { id } = await params;

  const practice = await db.query.practices.findFirst({
    where: and(eq(tables.practices.id, id), eq(tables.practices.clubId, session.clubId)),
    with: {
      facility: true,
      attendance: { with: { diver: true } },
    },
  });
  if (!practice) notFound();

  const rsvps = practice.requiresSignup
    ? await db.query.practiceRsvps.findMany({
        where: eq(tables.practiceRsvps.practiceId, practice.id),
        with: { diver: true },
      })
    : [];
  const attendingCount = rsvps.filter((r) => r.status === "attending").length;

  const groupIds = (practice.eligibleGroupIds as string[]) ?? [];
  const groups = await db.query.groups.findMany({ where: eq(tables.groups.clubId, session.clubId) });
  const eligibleGroups = groupIds.length === 0 ? groups : groups.filter((g) => groupIds.includes(g.id));

  const charges = await db.query.charges.findMany({
    where: and(eq(tables.charges.clubId, session.clubId), eq(tables.charges.serviceDate, practice.practiceDate)),
  });
  const attendanceIds = new Set(practice.attendance.map((a) => a.id));
  const practiceCharges = charges.filter((c) =>
    c.sourceType === "attendance" && c.sourceId != null && attendanceIds.has(c.sourceId));
  const billedTotal = practiceCharges.filter((c) => c.status !== "voided" && c.status !== "waived")
    .reduce((s, c) => s + c.amountCents, 0);

  const counts = {
    present: practice.attendance.filter((a) => a.status === "present").length,
    trial: practice.attendance.filter((a) => a.status === "trial").length,
    absent: practice.attendance.filter((a) => a.status === "absent").length,
    excused: practice.attendance.filter((a) => a.status === "excused").length,
  };

  const catLabel = { weekday: "Weekday practice", sunday: "Sunday practice", clinic: "Clinic", non_billable: "Non-billable" }[practice.category];

  return (
    <div className="space-y-5 max-w-2xl">
      <header>
        <Link href="/calendar" className="text-sm text-mute hover:text-navy">← Calendar</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="display text-2xl md:text-3xl">{practice.title}</h1>
          {practice.status === "canceled" && <span className="chip chip-danger">Canceled</span>}
          {practice.status === "changed" && <span className="chip chip-warn">Changed</span>}
        </div>
        <p className="text-sm text-mute mt-1">
          {formatLocalDate(practice.practiceDate as YMD)} · {formatLocalTime(practice.startsAt)}–{formatLocalTime(practice.endsAt)}
          {practice.facility ? ` · ${practice.facility.name}` : ""} · {catLabel}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {practice.status !== "canceled" ? (
          <>
            <Link href={`/practices/${practice.id}/attendance`} className="btn btn-primary">Take attendance</Link>
            <Link href={`/practices/${practice.id}/edit`} className="btn btn-secondary">Edit / cancel</Link>
          </>
        ) : (
          <form action={restorePractice}>
            <input type="hidden" name="practiceId" value={practice.id} />
            <button className="btn btn-secondary">Restore this practice</button>
          </form>
        )}
      </div>

      <section className="card p-4">
        <h2 className="eyebrow mb-2">At a glance</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span><span className="display text-xl">{counts.present}</span> present</span>
          <span><span className="display text-xl">{counts.trial}</span> trial</span>
          <span><span className="display text-xl">{counts.absent}</span> absent</span>
          <span><span className="display text-xl">{counts.excused}</span> excused</span>
          {billedTotal > 0 && <span className="ml-auto"><span className="display text-xl">{formatCents(billedTotal)}</span> billed</span>}
        </div>
        <p className="text-sm text-mute mt-3">
          Eligible: {eligibleGroups.map((g) => g.name).join(", ") || "All groups"}
          {practice.capacity ? ` · capacity ${practice.capacity}` : ""}
        </p>
        {practice.publicDescription && <p className="text-sm mt-2">{practice.publicDescription}</p>}
        {practice.internalNotes && <p className="text-sm mt-2 text-mute">Internal: {practice.internalNotes}</p>}
      </section>

      {practice.requiresSignup && (
        <section className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="eyebrow">Sign-ups</h2>
            <span className={`chip ${attendingCount >= (practice.minSignupCount ?? 0) ? "chip-ok" : "chip-warn"}`}>
              {attendingCount} attending{practice.minSignupCount ? ` / needs ${practice.minSignupCount}` : ""}
            </span>
          </div>
          {practice.status === "scheduled" && practice.minSignupCount != null && (
            <p className="text-xs text-mute mb-2">
              Auto-cancels {practice.signupCutoffHours ?? 24}h before start if fewer than {practice.minSignupCount} are attending.
            </p>
          )}
          {practice.status === "canceled" && practice.autoCanceledAt && (
            <p className="text-xs text-mute mb-2">This practice was auto-canceled for low sign-up.</p>
          )}
          {rsvps.length === 0 ? (
            <p className="text-sm text-mute">No responses yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {rsvps
                .sort((a, b) => (a.diver.legalName < b.diver.legalName ? -1 : 1))
                .map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Link href={`/divers/${r.diverId}`} className="font-semibold text-navy hover:underline">
                      {r.diver.preferredName || r.diver.legalName}
                    </Link>
                    <span className={`chip ${r.status === "attending" ? "chip-ok" : "chip-mute"}`}>
                      {r.status === "attending" ? "Attending" : "Can't make it"}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {practice.attendance.length > 0 && (
        <section className="card p-4">
          <h2 className="eyebrow mb-2">Marked so far</h2>
          <ul className="text-sm space-y-1">
            {practice.attendance
              .sort((a, b) => (a.diver.legalName < b.diver.legalName ? -1 : 1))
              .map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <Link href={`/divers/${a.diverId}`} className="font-semibold text-navy hover:underline">
                    {a.diver.preferredName || a.diver.legalName}
                  </Link>
                  <span className={`chip ${
                    a.status === "present" ? "chip-ok" : a.status === "trial" ? "chip-accent" :
                    a.status === "excused" ? "chip-warn" : a.status === "absent" ? "chip-mute" : "chip-mute"
                  }`}>{a.status}</span>
                  {!a.billable && a.status === "present" && <span className="text-xs text-mute">not billed{a.billableOverrideReason ? `: ${a.billableOverrideReason}` : ""}</span>}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
