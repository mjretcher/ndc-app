"use client";

import { useState, useTransition } from "react";
import { setAttendance, markRemainingAbsent } from "@/app/actions/attendance";

export type RosterDiver = {
  diverId: string;
  name: string;
  group: string | null;
  groupColor: string | null;
  status: "unmarked" | "present" | "absent" | "excused" | "trial";
  billable: boolean;
  billableReason: string | null;
};

const STATUSES = [
  { key: "present", label: "Here", cls: "bg-ok text-white", idle: "border-ok text-ok" },
  { key: "absent", label: "Out", cls: "bg-mute text-white", idle: "border-line text-mute" },
  { key: "excused", label: "Excused", cls: "bg-warn text-white", idle: "border-warn text-warn" },
  { key: "trial", label: "Trial", cls: "bg-accent text-white", idle: "border-accent text-accent" },
] as const;

export function AttendanceSheet({ practiceId, initialRoster, walkOnOptions }: {
  practiceId: string;
  initialRoster: RosterDiver[];
  walkOnOptions: { diverId: string; name: string }[];
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [walkOns, setWalkOns] = useState(walkOnOptions);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  const counts = {
    present: roster.filter((r) => r.status === "present").length,
    trial: roster.filter((r) => r.status === "trial").length,
    absent: roster.filter((r) => r.status === "absent").length,
    excused: roster.filter((r) => r.status === "excused").length,
    unmarked: roster.filter((r) => r.status === "unmarked").length,
  };

  function mark(diverId: string, status: RosterDiver["status"], billable?: boolean, reason?: string) {
    setError(null);
    setRoster((rs) => rs.map((r) => r.diverId === diverId
      ? { ...r, status, billable: billable ?? (status !== "trial"), billableReason: reason ?? null }
      : r));
    startTransition(async () => {
      try {
        await setAttendance({ practiceId, diverId, status, billable, reason });
      } catch {
        setError("A change didn't save — check your connection and tap again.");
      }
    });
  }

  function toggleBillable(r: RosterDiver) {
    if (r.billable) {
      const reason = window.prompt("Why is this practice not billed? (e.g. make-up, coach comp)") ?? "";
      if (!reason.trim()) return;
      mark(r.diverId, r.status, false, reason.trim());
    } else {
      mark(r.diverId, r.status, true);
    }
  }

  function addWalkOn(diverId: string) {
    const opt = walkOns.find((w) => w.diverId === diverId);
    if (!opt) return;
    setWalkOns((ws) => ws.filter((w) => w.diverId !== diverId));
    setRoster((rs) => [...rs, {
      diverId, name: opt.name.replace(/ \(.+\)$/, ""), group: null, groupColor: null,
      status: "present", billable: true, billableReason: null,
    }]);
    startTransition(async () => {
      try {
        await setAttendance({ practiceId, diverId, status: "present" });
      } catch {
        setError("A change didn't save — check your connection and tap again.");
      }
    });
  }

  async function sweepAbsent() {
    const ids = roster.filter((r) => r.status === "unmarked").map((r) => r.diverId);
    if (ids.length === 0) return;
    setSweeping(true);
    setRoster((rs) => rs.map((r) => r.status === "unmarked" ? { ...r, status: "absent" } : r));
    try {
      await markRemainingAbsent({ practiceId, diverIds: ids });
    } catch {
      setError("Some changes didn't save — check your connection.");
    } finally {
      setSweeping(false);
    }
  }

  return (
    <div className="space-y-3 pb-24">
      {/* Scoreboard */}
      <div className="card p-3 flex items-center gap-4 text-sm sticky top-0 z-10">
        <span><span className="display text-lg text-ok">{counts.present}</span> here</span>
        {counts.trial > 0 && <span><span className="display text-lg text-accent">{counts.trial}</span> trial</span>}
        <span><span className="display text-lg text-mute">{counts.absent}</span> out</span>
        {counts.excused > 0 && <span><span className="display text-lg text-warn">{counts.excused}</span> exc</span>}
        <span className="ml-auto text-mute">{counts.unmarked} left</span>
        {pending && <span aria-live="polite" className="h-2 w-2 rounded-full bg-accent animate-pulse" title="Saving…" />}
      </div>

      {error && <p role="alert" className="error-text card border-danger bg-danger-soft p-3">{error}</p>}

      <ul className="space-y-2">
        {roster.map((r) => (
          <li key={r.diverId} className={`card p-3 ${r.status !== "unmarked" ? "opacity-95" : ""}`}>
            <div className="flex items-center gap-2">
              <p className="font-semibold flex-1 min-w-0 truncate">{r.name}</p>
              {r.group && (
                <span className={`chip ${r.groupColor === "orange" ? "chip-accent" : r.groupColor === "brown" ? "chip-brown" : "chip-navy"}`}>
                  {r.group}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {STATUSES.map((s) => (
                <button key={s.key} type="button"
                  onClick={() => mark(r.diverId, r.status === s.key ? "unmarked" : s.key)}
                  aria-pressed={r.status === s.key}
                  className={`min-h-12 rounded-lg border-2 font-bold text-sm transition-colors ${
                    r.status === s.key ? `${s.cls} border-transparent` : `bg-white ${s.idle}`
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            {(r.status === "present" || r.status === "trial") && (
              <button type="button" onClick={() => toggleBillable(r)}
                className={`mt-1.5 text-xs font-semibold ${r.billable ? "text-mute hover:text-danger" : "text-danger"}`}>
                {r.billable ? "Billing normally — tap to waive" : `Not billed${r.billableReason ? ` (${r.billableReason})` : ""} — tap to bill`}
              </button>
            )}
          </li>
        ))}
      </ul>

      {walkOns.length > 0 && (
        <div className="card p-3">
          <label className="label" htmlFor="walkon">Add a diver from another group</label>
          <select id="walkon" className="input" value=""
            onChange={(e) => e.target.value && addWalkOn(e.target.value)}>
            <option value="">Choose a diver…</option>
            {walkOns.map((w) => <option key={w.diverId} value={w.diverId}>{w.name}</option>)}
          </select>
        </div>
      )}

      {/* Sweep bar */}
      {counts.unmarked > 0 && (
        <div className="fixed bottom-16 md:bottom-4 left-0 right-0 px-4 md:pl-60 z-20">
          <div className="max-w-lg mx-auto">
            <button type="button" onClick={sweepAbsent} disabled={sweeping}
              className="btn btn-primary w-full shadow-lg">
              {sweeping ? "Marking…" : `Mark remaining ${counts.unmarked} absent`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
