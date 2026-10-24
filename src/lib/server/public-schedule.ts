import "server-only";
import { db, tables } from "@/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { todayYMD, formatLocalTime, localToUtc, addDaysYMD, ymdDayOfWeek, ymdToUtcNoon, type YMD } from "@/lib/dates";

export type LivePractice = {
  id: string;
  time: string;
  facilityName: string | null;
  status: "scheduled" | "changed" | "canceled" | "completed";
  requiresSignup: boolean;
  minSignupCount: number | null;
  category: string;
  note: string | null;
};

export type LiveDay = {
  date: YMD;
  weekday: string; // "Monday"
  dateLabel: string; // "October 26, 2026"
  isToday: boolean;
  isPast: boolean;
  practices: LivePractice[];
};

export type LiveWeek = {
  label: string; // "This week" | "Next week"
  rangeLabel: string; // "Oct 19 – 25, 2026"
  start: YMD;
  end: YMD;
  days: LiveDay[]; // only days that have at least one practice
};

export type LiveSchedule = {
  weeks: LiveWeek[];
  /** Set when every practice across both weeks is at the same facility. */
  sharedFacilityName: string | null;
};

const fmt = (ymd: YMD, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(ymdToUtcNoon(ymd));

function rangeLabel(start: YMD, end: YMD): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const mon = (ymd: YMD) => fmt(ymd, { month: "short" });
  if (sy === ey && sm === em) return `${mon(start)} ${sd} \u2013 ${ed}, ${ey}`;
  if (sy === ey) return `${mon(start)} ${sd} \u2013 ${mon(end)} ${ed}, ${ey}`;
  return `${mon(start)} ${sd}, ${sy} \u2013 ${mon(end)} ${ed}, ${ey}`;
}

/** Monday of the club-local week containing `ymd`. */
function mondayOf(ymd: YMD): YMD {
  const dow = ymdDayOfWeek(ymd); // 0=Sun..6=Sat
  return addDaysYMD(ymd, dow === 0 ? -6 : 1 - dow);
}

/**
 * Live public schedule: actual practice occurrences for the current
 * Monday–Sunday week and the following week. Reflects cancellations,
 * one-off practices, time changes, and facility changes as coaches make them.
 */
export async function getLiveTwoWeekSchedule(): Promise<LiveSchedule> {
  const club = await db.query.clubs.findFirst();
  if (!club) return { weeks: [], sharedFacilityName: null };

  const today = todayYMD();
  const thisMonday = mondayOf(today);
  const nextMonday = addDaysYMD(thisMonday, 7);
  const lastDay = addDaysYMD(nextMonday, 6);

  const rows = await db.query.practices.findMany({
    where: and(
      eq(tables.practices.clubId, club.id),
      gte(tables.practices.practiceDate, thisMonday),
      lte(tables.practices.practiceDate, lastDay),
    ),
    with: { facility: true },
    orderBy: [asc(tables.practices.practiceDate), asc(tables.practices.startsAt)],
  });

  // Cancellations stay visible (shown struck through) so families aren't left guessing.
  const facilityNames = new Set<string>();
  const byDate = new Map<YMD, LivePractice[]>();
  for (const p of rows) {
    const facilityName = p.facility?.name ?? null;
    if (facilityName && p.status !== "canceled") facilityNames.add(facilityName);
    const list = byDate.get(p.practiceDate) ?? [];
    const time = `${formatLocalTime(p.startsAt)}\u2013${formatLocalTime(p.endsAt)}`;
    // Two groups practicing at the same time/place look identical to families — show once.
    const dup = list.find((x) => x.time === time && x.facilityName === facilityName && (x.status === "canceled") === (p.status === "canceled"));
    if (dup) {
      dup.requiresSignup = dup.requiresSignup && p.requiresSignup;
      continue;
    }
    list.push({
      id: p.id,
      time: `${formatLocalTime(p.startsAt)}–${formatLocalTime(p.endsAt)}`,
      facilityName,
      status: p.status,
      requiresSignup: p.requiresSignup,
      minSignupCount: p.minSignupCount,
      category: p.category,
      note: p.publicDescription?.trim() || null,
    });
    byDate.set(p.practiceDate, list);
  }

  const buildWeek = (label: string, start: YMD): LiveWeek => {
    const end = addDaysYMD(start, 6);
    const days: LiveDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDaysYMD(start, i);
      const practices = byDate.get(date);
      if (!practices?.length) continue;
      days.push({
        date,
        weekday: fmt(date, { weekday: "long" }),
        dateLabel: fmt(date, { month: "long", day: "numeric", year: "numeric" }),
        isToday: date === today,
        isPast: date < today,
        practices,
      });
    }
    return { label, rangeLabel: rangeLabel(start, end), start, end, days };
  };

  return {
    weeks: [buildWeek("This week", thisMonday), buildWeek("Next week", nextMonday)],
    sharedFacilityName: facilityNames.size === 1 ? [...facilityNames][0] : null,
  };
}

// ---- Template week (used by the family portal) ----

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
