import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq, desc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { formatCents } from "@/lib/money";
import { todayYMD } from "@/lib/dates";
import { updateFamily, upsertGuardian, addDiscount, endDiscount } from "@/app/actions/families";
import { addCredit, addManualCharge, recordPayment } from "@/app/actions/billing";
import { createGuardianLogin, resetGuardianPassword, setGuardianLoginActive } from "@/app/actions/family-accounts";
import { MergeFamilyForm } from "./MergeFamilyForm";
import { PasswordInput } from "@/components/PasswordInput";

export const metadata = { title: "Family" };

export default async function FamilyDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCoach();
  const { id } = await params;
  const today = todayYMD();

  const family = await db.query.families.findFirst({
    where: and(eq(tables.families.id, id), eq(tables.families.clubId, session.clubId)),
    with: {
      guardians: true,
      divers: { with: { primaryGroup: true, planAssignments: { with: { plan: true } } } },
    },
  });
  if (!family) notFound();

  const invoices = await db.query.invoices.findMany({
    where: eq(tables.invoices.familyId, id),
    with: { cycle: true },
    orderBy: [desc(tables.invoices.createdAt)],
    limit: 24,
  });
  const creditRows = await db.query.credits.findMany({
    where: and(eq(tables.credits.familyId, id), eq(tables.credits.voided, false)),
    orderBy: [desc(tables.credits.createdAt)],
  });
  const availableCredit = creditRows.reduce((s, c) => s + c.remainingCents, 0);
  const discounts = await db.query.discountsAndAid.findMany({
    where: and(eq(tables.discountsAndAid.familyId, id), eq(tables.discountsAndAid.active, true)),
  });

  // Portal login status per guardian (guardians and users are linked by email,
  // not a foreign key, since a guardian can exist before ever getting a login).
  const guardianEmails = family.guardians.map((g) => g.email?.toLowerCase().trim()).filter((e): e is string => !!e);
  const loginUsers = guardianEmails.length
    ? await db.query.users.findMany({ where: (u, { inArray }) => inArray(u.email, guardianEmails) })
    : [];
  const memberships = loginUsers.length
    ? await db.query.clubMemberships.findMany({
        where: and(eq(tables.clubMemberships.clubId, session.clubId), eq(tables.clubMemberships.familyId, id)),
      })
    : [];
  const loginByEmail = new Map(loginUsers.map((u) => {
    const m = memberships.find((mm) => mm.userId === u.id);
    return [u.email, { userId: u.id, active: u.active && (m?.active ?? false) }];
  }));

  const otherFamilies = session.role === "owner_admin"
    ? await db.query.families.findMany({
        where: and(eq(tables.families.clubId, session.clubId), eq(tables.families.status, "active")),
        orderBy: (f, { asc }) => [asc(f.billingName)],
        limit: 300,
      })
    : [];
  const paymentsRows = await db.query.payments.findMany({
    where: eq(tables.payments.familyId, id),
    orderBy: [desc(tables.payments.receivedDate)],
    limit: 12,
  });
  const draftCharges = await db.query.charges.findMany({
    where: and(eq(tables.charges.familyId, id), eq(tables.charges.status, "draft")),
    orderBy: [desc(tables.charges.serviceDate)],
  });

  const invoiceChip = (s: string) =>
    s === "paid" ? "chip-ok" : s === "issued" ? "chip-navy" : s === "partially_paid" ? "chip-warn" :
    s === "void" ? "chip-mute" : "chip-accent";

  return (
    <div className="space-y-6">
      <header>
        <Link href="/families" className="text-sm text-mute hover:text-navy">← Families</Link>
        <h1 className="display text-2xl md:text-3xl mt-1">{family.billingName}</h1>
        <p className="text-sm text-mute">
          {[family.addressLine1, family.city, family.state, family.zip].filter(Boolean).join(", ") || "No address on file"}
          {availableCredit > 0 && <span className="chip chip-ok ml-2">Credit {formatCents(availableCredit)}</span>}
        </p>
      </header>

      {session.role === "owner_admin" && family.status === "active" && otherFamilies.length > 0 && (
        <details className="card p-4">
          <summary className="text-sm font-semibold text-navy cursor-pointer">Merge a duplicate family into this one</summary>
          <p className="hint mt-2">
            Use this when a family shows up twice — e.g. a spreadsheet-backfilled record and a new
            self-registration for the same family. Pick the duplicate below; everything (guardians, divers,
            attendance history, charges, invoices, and any portal login) moves into <strong>{family.billingName}</strong>,
            and the duplicate is marked merged rather than deleted.
          </p>
          <MergeFamilyForm
            keepFamilyId={family.id}
            keepFamilyName={family.billingName}
            candidates={otherFamilies.filter((f) => f.id !== family.id)}
          />
        </details>
      )}

      <section aria-labelledby="divers-h">
        <h2 id="divers-h" className="eyebrow mb-2">Divers</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {family.divers.map((d) => {
            const plan = d.planAssignments
              .filter((a) => a.effectiveStart <= today && (!a.effectiveEnd || a.effectiveEnd >= today))
              .sort((a, b) => (a.effectiveStart < b.effectiveStart ? 1 : -1))[0];
            return (
              <Link key={d.id} href={`/divers/${d.id}`} className="card p-4 hover:border-navy">
                <p className="font-semibold">{d.preferredName || d.legalName}</p>
                <p className="text-sm text-mute mt-0.5">
                  {d.primaryGroup?.name ?? "No group"} · {plan?.plan.name ?? "No billing plan"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="guardians-h" className="card p-4">
        <h2 id="guardians-h" className="eyebrow mb-2">Guardians &amp; contacts</h2>
        <ul className="space-y-2">
          {family.guardians.map((g) => {
            const email = g.email?.toLowerCase().trim();
            const login = email ? loginByEmail.get(email) : undefined;
            return (
              <li key={g.id} className="text-sm border border-line rounded-lg p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{g.name}</span>
                  {g.relationship && <span className="text-mute">({g.relationship})</span>}
                  {g.email && <span>{g.email}</span>}
                  {g.phone && <span>{g.phone}</span>}
                  {g.isPrimary && <span className="chip chip-navy">Primary</span>}
                  {g.isEmergencyContact && <span className="chip chip-danger">Emergency</span>}
                </div>
                {session.role === "owner_admin" && (
                  <div className="mt-2">
                    {!g.email ? (
                      <span className="text-xs text-mute">Add an email to enable portal access.</span>
                    ) : !login ? (
                      <form action={createGuardianLogin} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="guardianId" value={g.id} />
                        <PasswordInput name="password" required minLength={8} placeholder="Set initial password"
                          wrapperClassName="!w-48" className="input !min-h-8 !py-1 text-xs" autoComplete="new-password" />
                        <button className="btn btn-secondary !min-h-8 !py-1 text-xs">Create portal login</button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`chip ${login.active ? "chip-ok" : "chip-mute"}`}>
                          Portal: {login.active ? "active" : "deactivated"}
                        </span>
                        <form action={resetGuardianPassword} className="flex items-center gap-1.5">
                          <input type="hidden" name="userId" value={login.userId} />
                          <input type="hidden" name="familyId" value={family.id} />
                          <PasswordInput name="password" required minLength={8} placeholder="New password"
                            wrapperClassName="!w-36" className="input !min-h-8 !py-1 text-xs" autoComplete="new-password" />
                          <button className="btn btn-secondary !min-h-8 !py-1 text-xs">Reset password</button>
                        </form>
                        <form action={setGuardianLoginActive}>
                          <input type="hidden" name="userId" value={login.userId} />
                          <input type="hidden" name="familyId" value={family.id} />
                          <input type="hidden" name="active" value={login.active ? "false" : "true"} />
                          <button className={`text-xs font-semibold ${login.active ? "text-danger" : "text-navy"}`}>
                            {login.active ? "Deactivate access" : "Reactivate access"}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <details className="mt-3">
          <summary className="text-sm font-semibold text-navy cursor-pointer">Add a contact</summary>
          <form action={upsertGuardian} className="mt-2 grid gap-2 md:grid-cols-2">
            <input type="hidden" name="familyId" value={family.id} />
            <input name="name" required placeholder="Name" className="input" aria-label="Name" />
            <input name="relationship" placeholder="Relationship" className="input" aria-label="Relationship" />
            <input name="email" type="email" placeholder="Email" className="input" aria-label="Email" />
            <input name="phone" type="tel" placeholder="Phone" className="input" aria-label="Phone" />
            <label className="text-sm flex items-center gap-2"><input type="checkbox" name="isPrimary" /> Primary contact</label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" name="isEmergencyContact" /> Emergency contact</label>
            <button className="btn btn-secondary md:col-span-2">Add contact</button>
          </form>
        </details>
      </section>

      <section aria-labelledby="billing-h" className="space-y-3">
        <h2 id="billing-h" className="eyebrow">Billing</h2>

        {draftCharges.length > 0 && (
          <div className="card p-4">
            <p className="font-semibold text-sm mb-2">Draft charges not yet invoiced</p>
            <ul className="text-sm space-y-1">
              {draftCharges.map((c) => (
                <li key={c.id} className="flex justify-between gap-3">
                  <span className="truncate">{c.serviceDate} · {c.description}</span>
                  <span className="font-semibold shrink-0">{formatCents(c.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr><th>Invoice</th><th>Cycle</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={4} className="text-mute">No invoices yet.</td></tr>}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td><Link href={`/invoices/${inv.id}`} className="font-semibold text-navy hover:underline">{inv.number ?? "Draft"}</Link></td>
                  <td>{inv.cycle.year}-{String(inv.cycle.month).padStart(2, "0")}</td>
                  <td>{formatCents(inv.totalCents)}</td>
                  <td><span className={`chip ${invoiceChip(inv.status)}`}>{inv.status.replace(/_/g, " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <form action={addManualCharge} className="card p-4 space-y-2">
            <p className="font-semibold text-sm">Add a manual charge</p>
            <input type="hidden" name="familyId" value={family.id} />
            <select name="diverId" className="input" aria-label="Diver">
              <option value="">Whole family</option>
              {family.divers.map((d) => <option key={d.id} value={d.id}>{d.preferredName || d.legalName}</option>)}
            </select>
            <input name="description" required placeholder="Meet fee, gear, etc." className="input" aria-label="Description" />
            <input name="amount" required placeholder="$0.00" inputMode="decimal" className="input" aria-label="Amount" />
            <input name="serviceDate" type="date" defaultValue={today} className="input" aria-label="Service date" />
            <button className="btn btn-secondary w-full">Add charge</button>
          </form>

          <form action={addCredit} className="card p-4 space-y-2">
            <p className="font-semibold text-sm">Add account credit</p>
            <input type="hidden" name="familyId" value={family.id} />
            <input name="amount" required placeholder="$0.00" inputMode="decimal" className="input" aria-label="Amount" />
            <input name="reason" required placeholder="Reason (required)" className="input" aria-label="Reason" />
            <button className="btn btn-secondary w-full">Add credit</button>
            {creditRows.length > 0 && (
              <ul className="text-xs text-mute pt-1 space-y-0.5">
                {creditRows.slice(0, 4).map((c) => (
                  <li key={c.id}>{formatCents(c.remainingCents)} left of {formatCents(c.amountCents)} — {c.reason}</li>
                ))}
              </ul>
            )}
          </form>

          <form action={recordPayment} className="card p-4 space-y-2">
            <p className="font-semibold text-sm">Record a payment</p>
            <input type="hidden" name="familyId" value={family.id} />
            <input name="amount" required placeholder="$0.00" inputMode="decimal" className="input" aria-label="Amount" />
            <select name="method" className="input" aria-label="Method">
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
            <select name="invoiceId" className="input" aria-label="Apply to invoice">
              <option value="">Not tied to an invoice</option>
              {invoices.filter((i) => i.status === "issued" || i.status === "partially_paid").map((i) => (
                <option key={i.id} value={i.id}>{i.number} — {formatCents(i.totalCents)}</option>
              ))}
            </select>
            <input name="receivedDate" type="date" defaultValue={today} className="input" aria-label="Received date" />
            <button className="btn btn-secondary w-full">Record payment</button>
            {paymentsRows.length > 0 && (
              <ul className="text-xs text-mute pt-1 space-y-0.5">
                {paymentsRows.slice(0, 4).map((p) => (
                  <li key={p.id}>{p.receivedDate}: {formatCents(p.amountCents)} {p.method}</li>
                ))}
              </ul>
            )}
          </form>
        </div>

        <div className="card p-4">
          <p className="font-semibold text-sm mb-2">Discounts &amp; aid</p>
          {discounts.length === 0 ? <p className="text-sm text-mute">None active.</p> : (
            <ul className="text-sm space-y-1.5 mb-3">
              {discounts.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="font-semibold">{d.label}</span>
                  <span>{d.kind === "fixed" ? formatCents(d.amountCents ?? 0) : `${d.percent}%`}</span>
                  <span className="text-mute">from {d.effectiveStart}{d.effectiveEnd ? ` to ${d.effectiveEnd}` : ""}</span>
                  <form action={endDiscount} className="ml-auto">
                    <input type="hidden" name="discountId" value={d.id} />
                    <input type="hidden" name="familyId" value={family.id} />
                    <button className="text-xs text-danger font-semibold">End today</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary className="text-sm font-semibold text-navy cursor-pointer">Add discount</summary>
            <form action={addDiscount} className="mt-2 grid gap-2 md:grid-cols-3">
              <input type="hidden" name="familyId" value={family.id} />
              <input name="label" required placeholder="Label (e.g. Sibling discount)" className="input md:col-span-2" aria-label="Label" />
              <select name="diverId" className="input" aria-label="Applies to">
                <option value="">Whole family</option>
                {family.divers.map((d) => <option key={d.id} value={d.id}>{d.preferredName || d.legalName}</option>)}
              </select>
              <select name="kind" className="input" aria-label="Type">
                <option value="percent">Percent</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <input name="percent" placeholder="Percent (e.g. 10)" inputMode="numeric" className="input" aria-label="Percent" />
              <input name="amount" placeholder="or $ amount" inputMode="decimal" className="input" aria-label="Fixed amount" />
              <input name="effectiveStart" type="date" defaultValue={today} className="input" aria-label="Start date" />
              <input name="effectiveEnd" type="date" className="input" aria-label="End date (optional)" />
              <button className="btn btn-secondary">Add</button>
            </form>
          </details>
        </div>
      </section>

      <details className="card p-4">
        <summary className="font-semibold cursor-pointer">Edit family details</summary>
        <form action={updateFamily} className="mt-3 grid gap-2 md:grid-cols-2">
          <input type="hidden" name="familyId" value={family.id} />
          <input name="billingName" defaultValue={family.billingName} className="input" aria-label="Billing name" />
          <select name="status" defaultValue={family.status} className="input" aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <input name="addressLine1" defaultValue={family.addressLine1 ?? ""} placeholder="Street" className="input" aria-label="Street" />
          <div className="grid grid-cols-3 gap-2">
            <input name="city" defaultValue={family.city ?? ""} placeholder="City" className="input" aria-label="City" />
            <input name="state" defaultValue={family.state ?? ""} placeholder="State" className="input" aria-label="State" />
            <input name="zip" defaultValue={family.zip ?? ""} placeholder="ZIP" className="input" aria-label="ZIP" />
          </div>
          <textarea name="notes" defaultValue={family.notes ?? ""} placeholder="Internal notes" rows={2} className="input md:col-span-2" aria-label="Notes" />
          <button className="btn btn-primary md:col-span-2">Save family</button>
        </form>
      </details>
    </div>
  );
}
