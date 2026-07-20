import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq, asc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { formatCents } from "@/lib/money";
import { todayYMD } from "@/lib/dates";
import {
  updateDiver, updateDiverMedical, updateMembership, sendMembershipReminder, assignPlan,
} from "@/app/actions/families";

export const metadata = { title: "Diver" };

export default async function DiverDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCoach();
  const { id } = await params;
  const today = todayYMD();

  const diver = await db.query.divers.findFirst({
    where: and(eq(tables.divers.id, id), eq(tables.divers.clubId, session.clubId)),
    with: {
      family: { with: { guardians: true } },
      primaryGroup: true,
      medical: true,
      memberships: true,
      planAssignments: { with: { plan: true } },
    },
  });
  if (!diver) notFound();

  const groups = await db.query.groups.findMany({
    where: and(eq(tables.groups.clubId, session.clubId), eq(tables.groups.active, true)),
    orderBy: [asc(tables.groups.sortOrder)],
  });
  const plans = await db.query.billingPlans.findMany({
    where: and(eq(tables.billingPlans.clubId, session.clubId), eq(tables.billingPlans.active, true)),
  });

  const assignments = [...diver.planAssignments].sort((a, b) => (a.effectiveStart < b.effectiveStart ? 1 : -1));
  const current = assignments.find((a) => a.effectiveStart <= today && (!a.effectiveEnd || a.effectiveEnd >= today));

  const memFor = (org: "aau" | "usa_diving") => diver.memberships.find((m) => m.organization === org);
  const primary = diver.family.guardians.find((g) => g.isPrimary) ?? diver.family.guardians[0];

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/families/${diver.familyId}`} className="text-sm text-mute hover:text-navy">← {diver.family.billingName}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="display text-2xl md:text-3xl">{diver.preferredName || diver.legalName}</h1>
          {diver.primaryGroup && (
            <span className={`chip ${diver.primaryGroup.colorToken === "orange" ? "chip-accent" : diver.primaryGroup.colorToken === "brown" ? "chip-brown" : "chip-navy"}`}>
              {diver.primaryGroup.name}
            </span>
          )}
          {diver.status !== "active" && <span className="chip chip-mute">{diver.status}</span>}
        </div>
        <p className="text-sm text-mute mt-1">
          {diver.legalName !== (diver.preferredName || diver.legalName) ? `Legal name ${diver.legalName} · ` : ""}
          Born {diver.birthDate}{diver.school ? ` · ${diver.school}` : ""}{diver.grade ? ` · grade ${diver.grade}` : ""}
          {primary ? ` · Contact ${primary.name}${primary.phone ? ` (${primary.phone})` : ""}` : ""}
        </p>
      </header>

      {/* Memberships */}
      <section aria-labelledby="mem-h" className="grid gap-4 md:grid-cols-2">
        {(["aau", "usa_diving"] as const).map((org) => {
          const m = memFor(org);
          const label = org === "aau" ? "AAU" : "USA Diving";
          const state =
            !m || m.verification === "missing" ? { chip: "chip-danger", text: "Missing" } :
            m.verification === "expired" || (m.expirationDate && m.expirationDate < today) ? { chip: "chip-danger", text: "Expired" } :
            m.verification === "pending" ? { chip: "chip-warn", text: "Pending verification" } :
            { chip: "chip-ok", text: "Verified" };
          return (
            <div key={org} className="card p-4">
              <div className="flex items-center justify-between">
                <h2 id={org === "aau" ? "mem-h" : undefined} className="display text-lg">{label} membership</h2>
                <span className={`chip ${state.chip}`}>{state.text}</span>
              </div>
              <form action={updateMembership} className="mt-3 grid grid-cols-2 gap-2">
                <input type="hidden" name="diverId" value={diver.id} />
                <input type="hidden" name="organization" value={org} />
                <input name="membershipNumber" defaultValue={m?.membershipNumber ?? ""} placeholder="Membership #" className="input" aria-label={`${label} number`} />
                <input name="membershipType" defaultValue={m?.membershipType ?? ""} placeholder={org === "aau" ? "Extended Coverage (AB)" : "Athlete"} className="input" aria-label={`${label} type`} />
                <input name="expirationDate" type="date" defaultValue={m?.expirationDate ?? ""} className="input" aria-label="Expiration" />
                <select name="verification" defaultValue={m?.verification ?? "missing"} className="input" aria-label="Verification">
                  <option value="missing">Missing</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified (I checked it)</option>
                  <option value="expired">Expired</option>
                </select>
                <input name="notes" defaultValue={m?.notes ?? ""} placeholder="Notes" className="input col-span-2" aria-label="Notes" />
                <button className="btn btn-secondary col-span-2">Save {label}</button>
              </form>
              {state.text !== "Verified" && (
                <form action={sendMembershipReminder} className="mt-2">
                  <input type="hidden" name="diverId" value={diver.id} />
                  <input type="hidden" name="organization" value={org} />
                  <button className="text-sm font-semibold text-accent hover:underline">
                    Email family the {label} sign-up guide →
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      {/* Billing plan */}
      <section aria-labelledby="plan-h" className="card p-4">
        <h2 id="plan-h" className="eyebrow mb-2">Billing plan</h2>
        <p className="text-sm mb-3">
          Current: <span className="font-semibold">{current ? current.plan.name : "None"}</span>
          {current?.overrideAmountCents != null && ` (custom ${formatCents(current.overrideAmountCents)}/mo)`}
        </p>
        <form action={assignPlan} className="grid gap-2 md:grid-cols-4">
          <input type="hidden" name="diverId" value={diver.id} />
          <select name="planId" required className="input md:col-span-2" aria-label="New plan">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.amountCents ? ` (${formatCents(p.amountCents)}/mo)` : p.installmentTotalCents ? ` (${formatCents(p.installmentTotalCents)} season)` : ""}
              </option>
            ))}
          </select>
          <input name="effectiveStart" type="date" defaultValue={today} className="input" aria-label="Effective from" />
          <input name="overrideAmount" placeholder="Custom $ (optional)" inputMode="decimal" className="input" aria-label="Override amount" />
          <input name="notes" placeholder="Note (optional)" className="input md:col-span-3" aria-label="Note" />
          <button className="btn btn-primary">Assign plan</button>
        </form>
        {assignments.length > 0 && (
          <details className="mt-3">
            <summary className="text-sm font-semibold text-navy cursor-pointer">Plan history</summary>
            <ul className="mt-2 text-sm space-y-1">
              {assignments.map((a) => (
                <li key={a.id} className="text-mute">
                  <span className="font-semibold text-ink">{a.plan.name}</span>
                  {" "}{a.effectiveStart} → {a.effectiveEnd ?? "ongoing"}
                  {a.overrideAmountCents != null && ` · custom ${formatCents(a.overrideAmountCents)}`}
                  {a.notes && ` · ${a.notes}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Safety & medical */}
      <section aria-labelledby="med-h" className="card p-4 border-danger/40">
        <h2 id="med-h" className="eyebrow mb-1 text-danger">Safety &amp; medical</h2>
        <p className="hint mb-3">Visible to coaching staff only. Never included in exports or emails.</p>
        <form action={updateDiverMedical} className="grid gap-2">
          <input type="hidden" name="diverId" value={diver.id} />
          <div>
            <label className="label" htmlFor="allergies">Allergies</label>
            <textarea id="allergies" name="allergies" rows={2} defaultValue={diver.medical?.allergies ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="medical">Medical considerations</label>
            <textarea id="medical" name="medicalConsiderations" rows={2} defaultValue={diver.medical?.medicalConsiderations ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="emn">Emergency notes</label>
            <textarea id="emn" name="emergencyNotes" rows={2} defaultValue={diver.medical?.emergencyNotes ?? ""} className="input" />
          </div>
          <button className="btn btn-secondary w-fit">Save medical info</button>
        </form>
      </section>

      {/* Profile edit */}
      <details className="card p-4">
        <summary className="font-semibold cursor-pointer">Edit profile</summary>
        <form action={updateDiver} className="mt-3 grid gap-2 md:grid-cols-2">
          <input type="hidden" name="diverId" value={diver.id} />
          <div>
            <label className="label" htmlFor="legalName">Legal name</label>
            <input id="legalName" name="legalName" defaultValue={diver.legalName} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="preferredName">Preferred name</label>
            <input id="preferredName" name="preferredName" defaultValue={diver.preferredName ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="school">School</label>
            <input id="school" name="school" defaultValue={diver.school ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="grade">Grade</label>
            <input id="grade" name="grade" defaultValue={diver.grade ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="group">Group</label>
            <select id="group" name="primaryGroupId" defaultValue={diver.primaryGroupId ?? ""} className="input">
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={diver.status} className="input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="prospective">Prospective</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="act">Activities &amp; schedule notes</label>
            <textarea id="act" name="activitiesNotes" rows={2} defaultValue={diver.activitiesNotes ?? ""} className="input" />
          </div>
          <button className="btn btn-primary md:col-span-2">Save profile</button>
        </form>
      </details>
    </div>
  );
}
