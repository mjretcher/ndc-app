import Link from "next/link";
import { formatCents } from "@/lib/money";

export function PageHeader({ title, eyebrow, actions, children }: {
  title: string; eyebrow?: string; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display text-2xl md:text-3xl">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="hint mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const groupChipClass: Record<string, string> = {
  orange: "chip-accent", brown: "chip-brown", navy: "chip-navy",
  sky: "chip-navy", slate: "chip-mute",
};

export function GroupChip({ name, colorToken }: { name: string | null | undefined; colorToken?: string | null }) {
  if (!name) return <span className="chip chip-mute">No group</span>;
  return <span className={`chip ${groupChipClass[colorToken ?? ""] ?? "chip-mute"}`}>{name}</span>;
}

export function Money({ cents, signed = false }: { cents: number; signed?: boolean }) {
  const cls = signed && cents < 0 ? "text-ok font-semibold" : "";
  return <span className={`tabular-nums ${cls}`}>{formatCents(cents)}</span>;
}

const statusChip: Record<string, { cls: string; label: string }> = {
  // attendance
  present: { cls: "chip-ok", label: "Present" },
  absent: { cls: "chip-danger", label: "Absent" },
  excused: { cls: "chip-mute", label: "Excused" },
  trial: { cls: "chip-accent", label: "Trial" },
  unmarked: { cls: "chip-mute", label: "Unmarked" },
  // submissions
  pending: { cls: "chip-warn", label: "Pending review" },
  needs_followup: { cls: "chip-accent", label: "Needs follow-up" },
  approved: { cls: "chip-ok", label: "Approved" },
  rejected: { cls: "chip-danger", label: "Rejected" },
  // memberships
  missing: { cls: "chip-danger", label: "Missing" },
  verified: { cls: "chip-ok", label: "Verified" },
  expired: { cls: "chip-danger", label: "Expired" },
  // charges
  draft: { cls: "chip-warn", label: "Draft" },
  reviewed: { cls: "chip-navy", label: "Reviewed" },
  invoiced: { cls: "chip-ok", label: "Invoiced" },
  waived: { cls: "chip-mute", label: "Waived" },
  voided: { cls: "chip-mute", label: "Voided" },
  // invoices
  ready_for_review: { cls: "chip-warn", label: "Ready for review" },
  issued: { cls: "chip-ok", label: "Issued" },
  partially_paid: { cls: "chip-navy", label: "Partially paid" },
  paid: { cls: "chip-ok", label: "Paid" },
  void: { cls: "chip-mute", label: "Void" },
  // practices
  scheduled: { cls: "chip-navy", label: "Scheduled" },
  changed: { cls: "chip-warn", label: "Changed" },
  canceled: { cls: "chip-danger", label: "Canceled" },
  completed: { cls: "chip-ok", label: "Completed" },
  // notifications
  queued: { cls: "chip-warn", label: "Queued" },
  sent: { cls: "chip-ok", label: "Sent" },
  failed: { cls: "chip-danger", label: "Failed" },
  skipped: { cls: "chip-mute", label: "Skipped" },
  // divers / general
  active: { cls: "chip-ok", label: "Active" },
  inactive: { cls: "chip-mute", label: "Inactive" },
  prospective: { cls: "chip-warn", label: "Prospective" },
  open: { cls: "chip-navy", label: "Open" },
  in_review: { cls: "chip-warn", label: "In review" },
  closed: { cls: "chip-mute", label: "Closed" },
};

export function StatusChip({ status }: { status: string }) {
  const s = statusChip[status] ?? { cls: "chip-mute", label: status };
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline">
      <span aria-hidden>←</span> {label}
    </Link>
  );
}

/** Yellow "confirm before launch" flag used on seeded prices. */
export function ConfirmFlag() {
  return <span className="chip chip-warn" title="Seeded default — confirm with NDC before production launch">Confirm before launch</span>;
}
