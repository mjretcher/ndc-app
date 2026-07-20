import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq, asc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { registrationSchema } from "@/lib/registration-schema";
import { approveRegistration, rejectRegistration, requestFollowup } from "@/app/actions/registrations";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Review registration" };

export default async function RegistrationDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCoach();
  const { id } = await params;

  const submission = await db.query.registrationSubmissions.findFirst({
    where: and(
      eq(tables.registrationSubmissions.id, id),
      eq(tables.registrationSubmissions.clubId, session.clubId),
    ),
  });
  if (!submission) notFound();

  const parsed = registrationSchema.safeParse(submission.payload);
  if (!parsed.success) {
    return <div className="card p-6 text-danger">This submission&apos;s data couldn&apos;t be read. Contact support with ID {id}.</div>;
  }
  const p = parsed.data;

  const groups = await db.query.groups.findMany({
    where: and(eq(tables.groups.clubId, session.clubId), eq(tables.groups.active, true)),
    orderBy: [asc(tables.groups.sortOrder)],
  });
  const plans = await db.query.billingPlans.findMany({
    where: and(eq(tables.billingPlans.clubId, session.clubId), eq(tables.billingPlans.active, true)),
  });

  const prefLabel = {
    flat_monthly: "Monthly flat rate", per_practice: "Pay per practice",
    high_school: "High school season", unsure: "Not sure yet",
  }[p.billingPreference];

  const suggestedPlanId = (groupSlugGuess: string | undefined) => {
    if (p.billingPreference === "per_practice") return plans.find((x) => x.planType === "per_practice")?.id ?? "";
    if (p.billingPreference === "high_school") return plans.find((x) => x.planType === "seasonal_installment")?.id ?? "";
    if (p.billingPreference === "flat_monthly" && groupSlugGuess) {
      const g = groups.find((x) => x.slug === groupSlugGuess);
      return plans.find((x) => x.planType === "flat_monthly" && x.groupId === g?.id)?.id ?? "";
    }
    return "";
  };

  const done = submission.status === "approved" || submission.status === "rejected";

  return (
    <div className="space-y-5">
      <header>
        <Link href="/registrations" className="text-sm text-mute hover:text-navy">← Registrations</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="display text-2xl md:text-3xl">{p.family.billingName}</h1>
          <span className={`chip ${
            submission.status === "pending" ? "chip-accent" :
            submission.status === "needs_followup" ? "chip-warn" :
            submission.status === "approved" ? "chip-ok" : "chip-mute"
          }`}>
            {submission.status === "needs_followup" ? "Waiting on family" : submission.status}
          </span>
        </div>
        <p className="text-sm text-mute mt-1">
          Submitted {submission.submittedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })}
          {" · "}prefers <strong>{prefLabel}</strong>
        </p>
        {submission.reviewNotes && (
          <p className="mt-2 text-sm bg-warn-soft text-warn rounded-lg px-3 py-2 inline-block">
            Review note: {submission.reviewNotes}
          </p>
        )}
        {submission.resultingFamilyId && (
          <p className="mt-2"><Link className="btn btn-secondary" href={`/families/${submission.resultingFamilyId}`}>Open family record →</Link></p>
        )}
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="eyebrow mb-2">Family &amp; guardians</h2>
          <p className="text-sm">{p.family.addressLine1}{p.family.addressLine2 ? `, ${p.family.addressLine2}` : ""}, {p.family.city}, {p.family.state} {p.family.zip}</p>
          <ul className="mt-3 space-y-2">
            {p.guardians.map((g, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold">{g.name}</span>
                {g.relationship ? ` (${g.relationship})` : ""} — {g.email} · {g.phone}
                <span className="chip chip-mute ml-2">{g.preferredContact}</span>
                {i === 0 && <span className="chip chip-navy ml-1">Primary</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm"><span className="font-semibold">Emergency:</span> {p.emergencyContact.name} · {p.emergencyContact.phone}{p.emergencyContact.relationship ? ` (${p.emergencyContact.relationship})` : ""}</p>
        </div>
        <div className="card p-4">
          <h2 className="eyebrow mb-2">Waiver</h2>
          <p className="text-sm">
            Signed <strong>{p.waiver.signatureName}</strong> on {p.waiver.signatureDate}. Risk, placement, and privacy acknowledgments all checked.
          </p>
        </div>
      </section>

      <form action={approveRegistration} className="space-y-4">
        <input type="hidden" name="submissionId" value={submission.id} />

        {p.divers.map((d, i) => (
          <section key={i} className="card p-4 space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="display text-lg">{d.preferredName || d.legalName}</h2>
              <span className="text-sm text-mute">
                {d.legalName !== (d.preferredName || d.legalName) ? `legal: ${d.legalName} · ` : ""}
                b. {d.birthDate}{d.school ? ` · ${d.school}` : ""}{d.grade ? ` · grade ${d.grade}` : ""}
              </span>
            </div>
            {d.experience && <p className="text-sm"><span className="font-semibold">Experience:</span> {d.experience}</p>}
            {d.activitiesNotes && <p className="text-sm"><span className="font-semibold">Schedule notes:</span> {d.activitiesNotes}</p>}
            {(d.allergies || d.medicalConsiderations || d.emergencyNotes) && (
              <div className="rounded-lg bg-danger-soft p-3 text-sm">
                <p className="font-semibold text-danger">Safety &amp; medical (coach eyes only)</p>
                {d.allergies && <p><span className="font-semibold">Allergies:</span> {d.allergies}</p>}
                {d.medicalConsiderations && <p><span className="font-semibold">Medical:</span> {d.medicalConsiderations}</p>}
                {d.emergencyNotes && <p><span className="font-semibold">Emergency notes:</span> {d.emergencyNotes}</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-sm">
              <span className={`chip ${d.aau.status === "have" ? "chip-ok" : "chip-warn"}`}>
                AAU: {d.aau.status === "have" ? (d.aau.membershipNumber || "has one") : "not yet"}
              </span>
              <span className={`chip ${d.usaDiving.status === "have" ? "chip-ok" : "chip-warn"}`}>
                USA Diving: {d.usaDiving.status === "have" ? (d.usaDiving.membershipNumber || "has one") : "not yet"}
              </span>
            </div>

            {!done && (
              <div className="grid gap-3 md:grid-cols-2 pt-2 border-t border-line">
                <div>
                  <label className="label" htmlFor={`group_${i}`}>Group placement</label>
                  <select id={`group_${i}`} name={`group_${i}`} className="input" defaultValue="">
                    <option value="">Decide later</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`plan_${i}`}>Billing plan</label>
                  <select id={`plan_${i}`} name={`plan_${i}`} className="input" defaultValue={suggestedPlanId(undefined)}>
                    <option value="">Decide later</option>
                    {plans.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}{pl.amountCents ? ` (${formatCents(pl.amountCents)}/mo)` : pl.installmentTotalCents ? ` (${formatCents(pl.installmentTotalCents)} season)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>
        ))}

        {!done && (
          <div className="card p-4 flex flex-wrap gap-3 items-center">
            <button className="btn btn-primary">Approve &amp; create family</button>
            <p className="hint flex-1 min-w-48">
              Creates the family, divers, and memberships, assigns any plans you
              chose, and emails the welcome message.
            </p>
          </div>
        )}
      </form>

      {!done && (
        <div className="grid gap-4 md:grid-cols-2">
          <form action={requestFollowup} className="card p-4 space-y-2">
            <input type="hidden" name="submissionId" value={submission.id} />
            <h2 className="eyebrow">Ask the family for more info</h2>
            <textarea name="notes" rows={2} required className="input" placeholder="What do you need from them?" />
            <button className="btn btn-secondary">Send follow-up email</button>
          </form>
          <form action={rejectRegistration} className="card p-4 space-y-2">
            <input type="hidden" name="submissionId" value={submission.id} />
            <h2 className="eyebrow">Not a fit</h2>
            <textarea name="notes" rows={2} className="input" placeholder="Internal note (optional, not emailed)" />
            <button className="btn btn-danger">Reject registration</button>
          </form>
        </div>
      )}
    </div>
  );
}
