/**
 * Timestamps are stored in UTC. All club-facing calendar logic runs on the
 * club's configured IANA timezone (default America/New_York).
 */

export const DEFAULT_TZ = "America/New_York";

export type YMD = string; // "2026-07-19"

/** Format a UTC Date as the club-local calendar date (YYYY-MM-DD). */
export function toLocalYMD(d: Date, tz: string = DEFAULT_TZ): YMD {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d); // en-CA yields YYYY-MM-DD
}

/** Day of week (0=Sunday..6=Saturday) for a UTC instant in the club timezone. */
export function localDayOfWeek(d: Date, tz: string = DEFAULT_TZ): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Day of week for a plain YMD calendar date (timezone-independent). */
export function ymdDayOfWeek(ymd: YMD): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Build a UTC Date for a club-local wall-clock time ("2026-07-19", "17:30").
 * Resolves DST correctly by iterating the UTC offset to a fixed point.
 */
export function localToUtc(ymd: YMD, hhmm: string, tz: string = DEFAULT_TZ): Date {
  const [y, mo, da] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  // Initial guess: treat wall time as UTC, then correct by observed offset (twice for DST edges).
  let guess = Date.UTC(y, mo - 1, da, h, mi);
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMinutes(new Date(guess), tz);
    guess = Date.UTC(y, mo - 1, da, h, mi) - offset * 60_000;
  }
  return new Date(guess);
}

/** Offset in minutes of tz from UTC at the given instant (EST = -300, EDT = -240). */
export function tzOffsetMinutes(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - d.getTime()) / 60_000);
}

export function formatLocalTime(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

export function formatLocalDate(d: Date | YMD, tz: string = DEFAULT_TZ): string {
  const date = typeof d === "string" ? ymdToUtcNoon(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: typeof d === "string" ? "UTC" : tz,
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  }).format(date);
}

/** Anchor a plain YMD at UTC noon so date-only formatting can't drift a day. */
export function ymdToUtcNoon(ymd: YMD): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function todayYMD(tz: string = DEFAULT_TZ): YMD {
  return toLocalYMD(new Date(), tz);
}

export function addDaysYMD(ymd: YMD, days: number): YMD {
  const d = ymdToUtcNoon(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive comparison helpers for effective-dated rows. */
export function ymdInRange(ymd: YMD, start: YMD, end: YMD | null): boolean {
  return ymd >= start && (end === null || ymd <= end);
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function ymdMonth(ymd: YMD): { year: number; month: number } {
  const [y, m] = ymd.split("-").map(Number);
  return { year: y, month: m };
}
