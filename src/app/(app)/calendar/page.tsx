import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, gte, lte, asc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { todayYMD, monthLabel, formatLocalTime, ymdDayOfWeek, addDaysYMD, type YMD } from "@/lib/dates";
import { categoryColorClass, categoryDotClass, CATEGORY_LEGEND } from "@/lib/practice-category-style";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const session = await requireCoach();
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.y) || now.getFullYear();
  const month = Number(sp.m) || now.getMonth() + 1;
  const today = todayYMD();

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const first = `${monthKey}-01` as YMD;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${monthKey}-${String(lastDay).padStart(2, "0")}` as YMD;

  const practices = await db.query.practices.findMany({
    where: and(
      eq(tables.practices.clubId, session.clubId),
      gte(tables.practices.practiceDate, first),
      lte(tables.practices.practiceDate, last),
    ),
    with: { facility: true },
    orderBy: [asc(tables.practices.startsAt)],
  });

  const byDate = new Map<string, typeof practices>();
  for (const p of practices) {
    const arr = byDate.get(p.practiceDate) ?? [];
    arr.push(p);
    byDate.set(p.practiceDate, arr);
  }

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  // Build grid cells: leading blanks then days
  const leading = ymdDayOfWeek(first); // 0=Sun
  const cells: (YMD | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => addDaysYMD(first, i)),
  ];

  const catColor = categoryColorClass;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1 className="display text-2xl md:text-3xl">{monthLabel(year, month)}</h1>
        </div>
        <div className="flex gap-2 items-center">
          <Link href={`/calendar?y=${prev.y}&m=${prev.m}`} className="btn btn-secondary" aria-label="Previous month">←</Link>
          <Link href="/calendar" className="btn btn-secondary">Today</Link>
          <Link href={`/calendar?y=${next.y}&m=${next.m}`} className="btn btn-secondary" aria-label="Next month">→</Link>
          <Link href={`/calendar/print?y=${year}&m=${month}`} className="btn btn-secondary">Print</Link>
          <Link href="/practices/new" className="btn btn-primary">New practice</Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 text-xs">
        {CATEGORY_LEGEND.map((c) => (
          <span key={c.label} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded inline-block ${c.dot}`} /> {c.label}
          </span>
        ))}
      </div>

      {/* Desktop grid */}
      <div className="hidden md:block card p-3">
        <div className="grid grid-cols-7 text-center eyebrow !text-[0.65rem] pb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => (
            <div key={i} className={`min-h-24 rounded-lg border p-1.5 ${d === today ? "border-accent bg-accent-soft/40" : "border-line"} ${d ? "" : "bg-paper border-transparent"}`}>
              {d && (
                <>
                  <p className={`text-xs font-bold ${d === today ? "text-accent" : "text-mute"}`}>{Number(d.slice(8))}</p>
                  <div className="mt-1 space-y-1">
                    {(byDate.get(d) ?? []).map((p) => (
                      <Link key={p.id} href={`/practices/${p.id}`}
                        className={`block rounded px-1.5 py-0.5 text-[0.68rem] font-semibold leading-tight truncate ${catColor(p.category, p.status)}`}>
                        {formatLocalTime(p.startsAt)} {p.title}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile list */}
      <div className="md:hidden space-y-2">
        {practices.length === 0 && <div className="card p-5 text-mute">No practices scheduled this month.</div>}
        {[...byDate.entries()].map(([date, list]) => (
          <div key={date} className="card p-3">
            <p className={`text-sm font-bold ${date === today ? "text-accent" : ""}`}>
              {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}
              {date === today && " · Today"}
            </p>
            <div className="mt-1.5 space-y-1.5">
              {list.map((p) => (
                <Link key={p.id} href={`/practices/${p.id}`} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                    p.status === "canceled" ? "bg-line" : categoryDotClass(p.category)}`} />
                  <span className={`text-sm ${p.status === "canceled" ? "line-through text-mute" : ""}`}>
                    {formatLocalTime(p.startsAt)}–{formatLocalTime(p.endsAt)} <span className="font-semibold">{p.title}</span>
                    {p.facility ? ` · ${p.facility.name}` : ""}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
