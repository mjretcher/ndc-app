import Link from "next/link";
import { db, tables } from "@/db";
import { and, eq, count, lt, isNull, or } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { todayYMD, formatLocalTime, monthLabel } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Today" };

export default async function DashboardPage() {
  const session = await requireCoach();
  const today = todayYMD();
  const now = new Date();

  const [pendingSubs] = await db.select({ n: count() }).from(tables.registrationSubmissions)
    .where(and(
      eq(tables.registrationSubmissions.clubId, session.clubId),
      eq(tables.registrationSubmissions.status, "pending"),
    ));

  const todaysPractices = await db.query.practices.findMany({
    where: and(eq(tables.practices.clubId, session.clubId), eq(tables.practices.practiceDate, today)),
    with: { facility: true, attendance: true },
    orderBy: (p, { asc }) => [asc(p.startsAt)],
  });

  // Membership problems: expired or missing among active divers
  const activeDivers = await db.query.divers.findMany({
    where: and(eq(tables.divers.clubId, session.clubId), eq(tables.divers.status, "active")),
    with: { memberships: true },
  });
  let membershipIssues = 0;
  for (const d of activeDivers) {
    for (const org of ["aau", "usa_diving"] as const) {
      const m = d.memberships.find((x) => x.organization === org);
      if (!m || m.verification === "missing" || m.verification === "expired" ||
          (m.expirationDate && m.expirationDate < today)) {
        membershipIssues++;
        break;
      }
    }
  }

  const [draftCharges] = await db.select({ n: count() }).from(tables.charges)
    .where(and(eq(tables.charges.clubId, session.clubId), eq(tables.charges.status, "draft")));

  const [failedEmails] = await db.select({ n: count() }).from(tables.notificationJobs)
    .where(and(eq(tables.notificationJobs.clubId, session.clubId), eq(tables.notificationJobs.status, "failed")));

  // Recent practices missing attendance (past 7 days, has unmarked or no records)
  const recent = await db.query.practices.findMany({
    where: and(
      eq(tables.practices.clubId, session.clubId),
      lt(tables.practices.practiceDate, today),
      or(eq(tables.practices.status, "scheduled"), eq(tables.practices.status, "changed")),
    ),
    with: { attendance: true },
    orderBy: (p, { desc }) => [desc(p.practiceDate)],
    limit: 15,
  });
  const missingAttendance = recent.filter((p) =>
    p.attendance.length === 0 || p.attendance.some((a) => a.status === "unmarked"),
  ).slice(0, 5);

  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const attention: { href: string; label: string; detail: string; tone: "accent" | "warn" | "danger" }[] = [];
  if (pendingSubs.n > 0) attention.push({ href: "/registrations", label: `${pendingSubs.n} registration${pendingSubs.n === 1 ? "" : "s"} waiting for review`, detail: "New families can't dive until you approve them", tone: "accent" });
  for (const p of missingAttendance) {
    attention.push({ href: `/practices/${p.id}/attendance`, label: `Attendance incomplete — ${p.title}`, detail: p.practiceDate, tone: "warn" });
  }
  if (membershipIssues > 0) attention.push({ href: "/memberships", label: `${membershipIssues} diver${membershipIssues === 1 ? "" : "s"} with membership gaps`, detail: "AAU or USA Diving missing / expired", tone: "warn" });
  if (failedEmails.n > 0) attention.push({ href: "/settings/notifications", label: `${failedEmails.n} email${failedEmails.n === 1 ? "" : "s"} failed to send`, detail: "Retry from the notification log", tone: "danger" });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Napoleon Diving Club</p>
          <h1 className="display text-2xl md:text-3xl">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }).format(now)}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/practices/new" className="btn btn-secondary">New practice</Link>
          <Link href={`/billing/${y}/${m}`} className="btn btn-primary">{monthLabel(y, m)} billing</Link>
        </div>
      </header>

      {/* Today's deck */}
      <section aria-labelledby="today-h">
        <h2 id="today-h" className="eyebrow mb-2">On deck today</h2>
        {todaysPractices.length === 0 ? (
          <div className="card p-5 text-mute">
            No practices today. <Link className="underline font-semibold text-navy" href="/calendar">Open the calendar</Link> to plan the week.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {todaysPractices.map((p) => {
              const present = p.attendance.filter((a) => a.status === "present" || a.status === "trial").length;
              return (
                <Link key={p.id} href={`/practices/${p.id}/attendance`} className="card p-4 hover:border-navy transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="display text-lg leading-tight">{p.title}</p>
                      <p className="text-sm text-mute mt-0.5">
                        {formatLocalTime(p.startsAt)}–{formatLocalTime(p.endsAt)}
                        {p.facility ? ` · ${p.facility.name}` : ""}
                      </p>
                    </div>
                    {p.status === "canceled" ? (
                      <span className="chip chip-danger">Canceled</span>
                    ) : (
                      <span className="chip chip-navy">{present} in</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-navy">Take attendance →</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Needs attention */}
      <section aria-labelledby="attn-h">
        <h2 id="attn-h" className="eyebrow mb-2">Needs attention</h2>
        {attention.length === 0 ? (
          <div className="card p-5 text-mute">All clear. Nothing is waiting on you right now.</div>
        ) : (
          <ul className="card divide-y divide-line">
            {attention.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="flex items-center gap-3 p-4 hover:bg-paper transition-colors">
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                    a.tone === "accent" ? "bg-accent" : a.tone === "warn" ? "bg-warn" : "bg-danger"
                  }`} />
                  <span className="min-w-0">
                    <span className="block font-semibold truncate">{a.label}</span>
                    <span className="block text-sm text-mute truncate">{a.detail}</span>
                  </span>
                  <span aria-hidden className="ml-auto text-mute">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Billing snapshot */}
      <section aria-labelledby="bill-h">
        <h2 id="bill-h" className="eyebrow mb-2">Billing snapshot</h2>
        <div className="card p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <p className="display text-2xl">{draftCharges.n}</p>
            <p className="text-sm text-mute">draft charges pending review</p>
          </div>
          <UnpaidTotal clubId={session.clubId} />
          <Link href="/billing" className="btn btn-secondary ml-auto">Open billing</Link>
        </div>
      </section>
    </div>
  );
}

async function UnpaidTotal({ clubId }: { clubId: string }) {
  const open = await db.query.invoices.findMany({
    where: and(
      eq(tables.invoices.clubId, clubId),
      or(eq(tables.invoices.status, "issued"), eq(tables.invoices.status, "partially_paid")),
    ),
    with: { family: { columns: { billingName: true } } },
  });
  const paidRows = await db.query.payments.findMany({
    where: isNull(tables.payments.invoiceId) ? undefined : undefined,
  });
  const paidByInvoice = new Map<string, number>();
  for (const p of paidRows) {
    if (p.invoiceId) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amountCents);
  }
  const outstanding = open.reduce((s, i) => s + Math.max(0, i.totalCents - (paidByInvoice.get(i.id) ?? 0)), 0);
  return (
    <div>
      <p className="display text-2xl">{formatCents(outstanding)}</p>
      <p className="text-sm text-mute">outstanding on {open.length} issued invoice{open.length === 1 ? "" : "s"}</p>
    </div>
  );
}
