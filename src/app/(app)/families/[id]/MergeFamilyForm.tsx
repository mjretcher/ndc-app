"use client";

import { mergeFamilies } from "@/app/actions/family-accounts";

export function MergeFamilyForm({
  keepFamilyId,
  keepFamilyName,
  candidates,
}: {
  keepFamilyId: string;
  keepFamilyName: string;
  candidates: { id: string; billingName: string }[];
}) {
  return (
    <form
      action={mergeFamilies}
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        if (!confirm(`Merge that family into ${keepFamilyName}? This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="keepFamilyId" value={keepFamilyId} />
      <select name="mergeFamilyId" required className="input !w-auto" aria-label="Duplicate family to merge in">
        <option value="">Choose the duplicate family…</option>
        {candidates.map((f) => (
          <option key={f.id} value={f.id}>{f.billingName}</option>
        ))}
      </select>
      <button className="btn btn-danger !min-h-9">Merge into {keepFamilyName}</button>
    </form>
  );
}
