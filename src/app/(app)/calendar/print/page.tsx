import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, gte, lte, asc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { todayYMD, monthLabel, formatLocalTime, ymdDayOfWeek, addDaysYMD, type YMD } from "@/lib/dates";
import { categoryColorClass, CATEGORY_LEGEND } from "@/lib/practice-category-style";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Print calendar" };

export default async function CalendarPrintPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
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
    with: { facility: true, coaches: { with: { user: true } } },
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

  const leading = ymdDayOfWeek(first);
  const cells: (YMD | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => addDaysYMD(first, i)),
  ];
  const weeks: (YMD | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="space-y-4">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Printable schedule</p>
          <h1 className="display text-2xl md:text-3xl">{monthLabel(year, month)}</h1>
        </div>
        <div className="flex gap-2 items-center">
          <Link href={`/calendar/print?y=${prev.y}&m=${prev.m}`} className="btn btn-secondary" aria-label="Previous month">←</Link>
          <Link href={`/calendar/print`} className="btn btn-secondary">This month</Link>
          <Link href={`/calendar/print?y=${next.y}&m=${next.m}`} className="btn btn-secondary" aria-label="Next month">→</Link>
          <Link href={`/calendar?y=${year}&m=${month}`} className="btn btn-secondary">Back to calendar</Link>
          <PrintButton />
        </div>
      </header>

      {/* Print-only header, since the sidebar/nav (which normally shows branding) is hidden */}
      <div className="hidden print:flex items-center justify-between border-b border-line pb-3 mb-1">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-mute">Napoleon Diving Club</p>
          <h1 className="text-2xl font-bold text-navy">{monthLabel(year, month)}</h1>
        </div>
        <div className="flex gap-3 text-xs">
          {CATEGORY_LEGEND.map((c) => (
            <span key={c.label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded inline-block ${c.dot}`} /> {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="no-print flex flex-wrap gap-3 text-xs">
        {CATEGORY_LEGEND.map((c) => (
          <span key={c.label} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded inline-block ${c.dot}`} /> {c.label}
          </span>
        ))}
      </div>

      <div className="card p-3 print:border-0 print:shadow-none print:p-0">
        <div className="grid grid-cols-7 text-center eyebrow !text-[0.7rem] pb-2 print:!text-[0.75rem]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5 print:gap-1">
          {weeks.map((week, wi) =>
            week.map((d, di) => (
              <div
                key={`${wi}-${di}`}
                className={`min-h-[7rem] print:min-h-[1.1in] rounded-lg border p-2 print:rounded-none print:break-inside-avoid ${
                  d === today ? "border-accent bg-accent-soft/40 print:bg-white print:border-line" : "border-line"
                } ${d ? "" : "bg-paper border-transparent print:border-transparent"}`}
              >
                {d && (
                  <>
                    <p className={`text-xs font-bold ${d === today ? "text-accent" : "text-mute"} print:text-black`}>
                      {Number(d.slice(8))}
                    </p>
                    <div className="mt-1 space-y-1">
                      {(byDate.get(d) ?? []).map((p) => (
                        <div
                          key={p.id}
                          className={`rounded px-1.5 py-1 text-[0.72rem] print:text-[9px] font-semibold leading-snug print:leading-tight ${categoryColorClass(p.category, p.status)}`}
                        >
                          <div>{formatLocalTime(p.startsAt)}–{formatLocalTime(p.endsAt)}</div>
                          <div>{p.title}</div>
                          {p.facility && <div className="font-normal opacity-90">{p.facility.name}</div>}
                          {p.coaches.length > 0 && (
                            <div className="font-normal opacity-90">Coach: {p.coaches.map((c) => c.user.name).join(", ")}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}
