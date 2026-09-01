import "server-only";
import { db, tables } from "@/db";
import { inArray } from "drizzle-orm";
import type { YMD } from "@/lib/dates";

export type WeeklyMap = Map<string, boolean>; // key: `${userId}:${weekday}`
export type ExceptionMap = Map<string, boolean>; // key: `${userId}:${date}`

export async function loadAvailabilityMaps(userIds: string[]): Promise<{ weekly: WeeklyMap; exceptions: ExceptionMap }> {
  if (userIds.length === 0) return { weekly: new Map(), exceptions: new Map() };
  const [weeklyRows, exceptionRows] = await Promise.all([
    db.query.coachWeeklyAvailability.findMany({ where: inArray(tables.coachWeeklyAvailability.userId, userIds) }),
    db.query.coachAvailabilityExceptions.findMany({ where: inArray(tables.coachAvailabilityExceptions.userId, userIds) }),
  ]);
  const weekly: WeeklyMap = new Map(weeklyRows.map((r) => [`${r.userId}:${r.weekday}`, r.available]));
  const exceptions: ExceptionMap = new Map(exceptionRows.map((r) => [`${r.userId}:${r.date}`, r.available]));
  return { weekly, exceptions };
}

/**
 * Resolve availability for one coach on one date. Exception overrides the
 * weekly pattern; no data at all (coach never set a preference) defaults to
 * available, so nobody is falsely flagged just for not using this feature.
 */
export function resolveAvailability(
  userId: string, date: YMD, weekday: number, maps: { weekly: WeeklyMap; exceptions: ExceptionMap },
): boolean {
  const exceptionKey = `${userId}:${date}`;
  if (maps.exceptions.has(exceptionKey)) return maps.exceptions.get(exceptionKey)!;
  const weeklyKey = `${userId}:${weekday}`;
  if (maps.weekly.has(weeklyKey)) return maps.weekly.get(weeklyKey)!;
  return true; // no preference set -> assume available
}
