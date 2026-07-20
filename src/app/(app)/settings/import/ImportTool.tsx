"use client";

import { useActionState } from "react";
import { previewImportAction, commitImportAction } from "@/app/actions/settings";

type PreviewState = Awaited<ReturnType<typeof previewImportAction>> | null;
type CommitState = Awaited<ReturnType<typeof commitImportAction>> | null;

export function ImportTool() {
  const [previewState, previewFormAction, previewing] = useActionState<PreviewState, FormData>(previewImportAction, null);
  const [commitState, commitFormAction, committing] = useActionState<CommitState, FormData>(commitImportAction, null);

  const preview = previewState && "preview" in previewState ? previewState.preview : null;
  const csvText = previewState && "csvText" in previewState ? previewState.csvText : "";
  const result = commitState && "result" in commitState ? commitState.result : null;

  if (result) {
    return (
      <div className="rounded-lg bg-ok-soft p-4 text-sm" role="status">
        <p className="font-semibold text-ok">Import finished</p>
        <p className="mt-1">
          Created {result.created} diver{result.created === 1 ? "" : "s"}
          {result.attached > 0 && <> ({result.attached} added to existing families)</>}.
          {result.skipped > 0 && <> Skipped {result.skipped} row{result.skipped === 1 ? "" : "s"} (duplicates or errors).</>}
        </p>
        {result.failed.length > 0 && (
          <ul className="mt-2 list-disc pl-5">
            {result.failed.slice(0, 10).map((f, i) => <li key={i}>Line {f.line}: {f.reason}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form action={previewFormAction} className="grid gap-2">
        <div>
          <label className="label" htmlFor="csvFile">Upload CSV file</label>
          <input id="csvFile" name="csvFile" type="file" accept=".csv,text/csv" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="csvText">…or paste CSV text</label>
          <textarea id="csvText" name="csvText" rows={5} className="input font-mono text-xs"
            placeholder="family_billing_name,guardian_name,guardian_email,…" />
        </div>
        <button className="btn btn-secondary" disabled={previewing}>{previewing ? "Checking…" : "Preview import"}</button>
        {previewState && "error" in previewState && previewState.error && (
          <p className="error-text" role="alert">{previewState.error}</p>
        )}
      </form>

      {preview && (
        <div className="rounded-lg border border-line p-4 space-y-3">
          {preview.headerErrors.length > 0 ? (
            <div role="alert" className="text-sm text-danger">
              <p className="font-semibold">The CSV header doesn&apos;t match the template:</p>
              <ul className="list-disc pl-5">{preview.headerErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          ) : (
            <>
              <p className="text-sm">
                Ready to create <strong>{preview.families}</strong> famil{preview.families === 1 ? "y" : "ies"} and{" "}
                <strong>{preview.divers}</strong> diver{preview.divers === 1 ? "" : "s"}.
                {preview.duplicateWarnings > 0 && (
                  <span className="chip chip-warn ml-2">{preview.duplicateWarnings} possible duplicate{preview.duplicateWarnings === 1 ? "" : "s"}</span>
                )}
              </p>
              <div className="max-h-64 overflow-auto text-xs">
                <table className="data">
                  <thead><tr><th>Line</th><th>Diver</th><th>Family</th><th>Issues</th></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.line} className={r.errors.length > 0 ? "bg-danger-soft" : r.warnings.length > 0 ? "bg-warn-soft" : ""}>
                        <td>{r.line}</td>
                        <td>{r.values.diver_legal_name}</td>
                        <td>{r.values.family_billing_name}</td>
                        <td>{[...r.errors, ...r.warnings].join("; ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.ok ? (
                <form action={commitFormAction}>
                  <input type="hidden" name="csvText" value={csvText} />
                  <button className="btn btn-primary" disabled={committing}>
                    {committing ? "Importing…" : `Import ${preview.divers} diver${preview.divers === 1 ? "" : "s"} now`}
                  </button>
                  <p className="hint mt-1">Rows with errors are skipped automatically; duplicates are skipped, never merged.</p>
                </form>
              ) : (
                <p className="text-sm text-danger font-semibold" role="alert">Fix the errors above and preview again.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
