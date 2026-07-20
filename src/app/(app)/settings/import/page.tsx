import { requireAdmin } from "@/lib/server/session";
import { ImportTool } from "./ImportTool";

export const metadata = { title: "Import / Export" };

export default async function ImportExportPage() {
  await requireAdmin();
  const exports = [
    { kind: "roster", label: "Active roster with guardian contacts" },
    { kind: "attendance", label: "Attendance records" },
    { kind: "charges", label: "Charges" },
    { kind: "invoices", label: "Invoices" },
    { kind: "memberships", label: "AAU / USA Diving memberships" },
    { kind: "balances", label: "Family balance summary" },
  ];
  return (
    <div className="space-y-6">
      <section className="card p-4">
        <h2 className="display text-lg mb-1">Export CSV</h2>
        <p className="hint mb-3">Everything downloads as plain CSV you can open in Excel or Sheets. Medical details are never exported.</p>
        <ul className="flex flex-wrap gap-2">
          {exports.map((e) => (
            <li key={e.kind}>
              <a href={`/api/export/${e.kind}`} className="btn btn-secondary !min-h-9" download>{e.label}</a>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="display text-lg">Import families &amp; divers from CSV</h2>
        <ol className="text-sm list-decimal pl-5 space-y-1 text-mute">
          <li><a href="/api/export/import-template" className="font-semibold text-navy underline" download>Download the CSV template</a> — one row per diver; repeat family columns for siblings.</li>
          <li>Fill it in from your old spreadsheets (dates as YYYY-MM-DD or MM/DD/YYYY).</li>
          <li>Upload below, review the preview and warnings, then confirm.</li>
        </ol>
        <p className="hint">Historical attendance and invoices are intentionally not importable — start those fresh in the app.</p>
        <ImportTool />
      </section>
    </div>
  );
}
