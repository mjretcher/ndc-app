import "server-only";
import { db, tables } from "@/db";
import { and, eq, lte, gte } from "drizzle-orm";
import { todayYMD, formatLocalTime, localToUtc } from "@/lib/dates";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type WeekScheduleDay = {
  day: string;
  time: string;
  requiresSignup: boolean;
  minSignupCount: number | null;
};

export type WeekSchedule = {
  days: WeekScheduleDay[];
  primaryFacilityName: string | null;
};

/**
 * One representative row per weekday, drawn from whichever practice series
 * are currently active (range covers today). This reflects real, current
 * scheduling automatically as new seasons/series are created, instead of
 * hardcoded copy that goes stale every time the schedule changes.
 */
export async function getCurrentWeekSchedule(): Promise<WeekSchedule> {
  const club = await db.query.clubs.findFirst();
  if (!club) return { days: [], primaryFacilityName: null };
  const today = todayYMD();

  const activeSeries = await db.query.practiceSeries.findMany({
    where: and(
      eq(tables.practiceSeries.clubId, club.id),
      lte(tables.practiceSeries.rangeStart, today),
      gte(tables.practiceSeries.rangeEnd, today),
    ),
    with: { facility: true },
  });

  const byWeekday = new Map<number, (typeof activeSeries)[number]>();
  const facilityCounts = new Map<string, number>();
  for (const series of activeSeries) {
    if (series.facility) facilityCounts.set(series.facility.name, (facilityCounts.get(series.facility.name) ?? 0) + 1);
    for (const wd of series.weekdays as number[]) {
      // If multiple series land on the same weekday, keep the earliest start time.
      const existing = byWeekday.get(wd);
      if (!existing || series.startTime < existing.startTime) byWeekday.set(wd, series);
    }
  }
  const primaryFacilityName = [...facilityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const days = [...byWeekday.entries()]
    .sort(([a], [b]) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)) // Mon..Sun order, Sunday last
    .map(([wd, series]) => ({
      day: WEEKDAY_NAMES[wd],
      time: `${formatLocalTime(localToUtc(today, series.startTime))}\u2013${formatLocalTime(localToUtc(today, series.endTime))}`,
      requiresSignup: series.requiresSignup,
      minSignupCount: series.minSignupCount,
    }));

  return { days, primaryFacilityName };
}
