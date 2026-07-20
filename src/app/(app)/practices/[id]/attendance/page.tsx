import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { formatLocalDate, formatLocalTime, type YMD } from "@/lib/dates";
import { AttendanceSheet, type RosterDiver } from "./AttendanceSheet";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCoach();
  const { id } = await params;

  const practice = await db.query.practices.findFirst({
    where: and(eq(tables.practices.id, id), eq(tables.practices.clubId, session.clubId)),
    with: { facility: true, attendance: true },
  });
  if (!practice) notFound();

  const groupIds = (practice.eligibleGroupIds as string[]) ?? [];
  const allDivers = await db.query.divers.findMany({
    where: and(eq(tables.divers.clubId, session.clubId), eq(tables.divers.status, "active")),
    with: { primaryGroup: true },
    orderBy: (d, { asc }) => [asc(d.legalName)],
  });

  const inRoster = (d: (typeof allDivers)[number]) =>
    groupIds.length === 0 || (d.primaryGroupId != null && groupIds.includes(d.primaryGroupId));

  const markedIds = new Set(practice.attendance.map((a) => a.diverId));
  const toRosterDiver = (d: (typeof allDivers)[number]): RosterDiver => {
    const a = practice.attendance.find((x) => x.diverId === d.id);
    return {
      diverId: d.id,
      name: d.preferredName || d.legalName,
      group: d.primaryGroup?.name ?? null,
      groupColor: d.primaryGroup?.colorToken ?? null,
      status: (a?.status ?? "unmarked") as RosterDiver["status"],
      billable: a?.billable ?? true,
      billableReason: a?.billableOverrideReason ?? null,
    };
  };

  const roster = allDivers.filter((d) => inRoster(d) || markedIds.has(d.id)).map(toRosterDiver);
  const walkOnOptions = allDivers
    .filter((d) => !inRoster(d) && !markedIds.has(d.id))
    .map((d) => ({ diverId: d.id, name: `${d.preferredName || d.legalName}${d.primaryGroup ? ` (${d.primaryGroup.name})` : ""}` }));

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <header>
        <Link href={`/practices/${id}`} className="text-sm text-mute hover:text-navy">← Practice details</Link>
        <h1 className="display text-xl md:text-2xl mt-0.5">{practice.title}</h1>
        <p className="text-sm text-mute">
          {formatLocalDate(practice.practiceDate as YMD)} · {formatLocalTime(practice.startsAt)}
          {practice.facility ? ` · ${practice.facility.name}` : ""}
        </p>
        {practice.status === "canceled" && (
          <p className="mt-2 chip chip-danger">This practice is canceled — attendance here won&apos;t bill.</p>
        )}
      </header>
      <AttendanceSheet practiceId={id} initialRoster={roster} walkOnOptions={walkOnOptions} />
    </div>
  );
}
