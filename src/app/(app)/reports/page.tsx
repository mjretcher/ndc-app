import { requireCoach } from "@/lib/server/session";
import { todayYMD } from "@/lib/dates";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireCoach();
  const today = todayYMD();
  const firstOfMonth = `${today.slice(0, 8)}01`;

  const reports = [
    { kind: "attendance", title: "Attendance", desc: "Every attendance mark per practice, with billable flags.", dated: true },
    { kind: "charges", title: "Charges", desc: "All charges by service date — plan, per-practice, manual, adjustments.", dated: true },
    { kind: "invoices", title: "Invoices", desc: "Invoice totals, discounts, credits, and status by cycle.", dated: true },
    { kind: "balances", title: "Family balances", desc: "What each family has been invoiced, paid, and still owes.", dated: false },
    { kind: "memberships", title: "Memberships", desc: "AAU and USA Diving numbers, expirations, and verification status.", dated: false },
    { kind: "roster", title: "Full roster", desc: "Divers with family contacts. Medical info is never exported.", dated: false },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <header>
        <p className="eyebrow">Data out</p>
        <h1 className="display text-2xl md:text-3xl">Reports &amp; exports</h1>
        <p className="text-sm text-mute mt-1">Everything downloads as CSV — opens straight into Excel or Google Sheets.</p>
      </header>

      <div className="space-y-3">
        {reports.map((r) => (
          <form key={r.kind} action={`/api/export/${r.kind}`} method="GET" className="card p-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <p className="font-semibold">{r.title}</p>
              <p className="text-sm text-mute">{r.desc}</p>
            </div>
            {r.dated && (
              <>
                <div>
                  <label className="label" htmlFor={`${r.kind}-from`}>From</label>
                  <input id={`${r.kind}-from`} name="from" type="date" defaultValue={firstOfMonth} className="input !w-40" />
                </div>
                <div>
                  <label className="label" htmlFor={`${r.kind}-to`}>To</label>
                  <input id={`${r.kind}-to`} name="to" type="date" defaultValue={today} className="input !w-40" />
                </div>
              </>
            )}
            <button className="btn btn-secondary">Download CSV</button>
          </form>
        ))}
      </div>
    </div>
  );
}
