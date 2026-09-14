import "server-only";
import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { sendTemplatedEmail } from "@/lib/server/notify";
import { isDiverEligibleForPractice } from "@/lib/eligibility";
import { formatLocalDate, formatLocalTime, type YMD } from "@/lib/dates";

/**
 * Email primary guardians of divers in the practice's eligible groups.
 *
 * Lives here rather than in an actions file on purpose: any exported async
 * function in a "use server" module becomes a publicly callable endpoint,
 * and this one takes a raw clubId with no session check. It's only ever
 * meant to be called from already-authenticated server code (practice
 * actions, the cron route), so it must not be a reachable action itself.
 */
export async function notifyPracticeFamilies(clubId: string, practiceId: string, eventType: string, changeSummary: string) {
  const practice = await db.query.practices.findFirst({
    where: eq(tables.practices.id, practiceId),
    with: { facility: true },
  });
  if (!practice) return;
  const clubDivers = await db.query.divers.findMany({
    where: and(eq(tables.divers.clubId, clubId), eq(tables.divers.status, "active")),
    with: { family: { with: { guardians: true } } },
  });
  const affected = clubDivers.filter((d) => isDiverEligibleForPractice(practice.eligibleGroupIds, d.primaryGroupId));

  const seen = new Set<string>();
  for (const diver of affected) {
    const primary = diver.family.guardians.find((g) => g.isPrimary && g.email) ?? diver.family.guardians.find((g) => g.email);
    if (!primary?.email || seen.has(primary.email)) continue;
    seen.add(primary.email);
    await sendTemplatedEmail({
      clubId,
      eventType,
      recipientEmail: primary.email,
      fields: {
        guardian_name: primary.name,
        practice_title: practice.title,
        practice_date: formatLocalDate(practice.practiceDate as YMD),
        practice_time: `${formatLocalTime(practice.startsAt)}–${formatLocalTime(practice.endsAt)}`,
        facility: practice.facility?.name ?? "TBD",
        change_summary: changeSummary,
      },
      idempotencyKey: `${eventType}:${practiceId}:${primary.email}`,
    });
  }
}
