import Link from "next/link";
import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { and, eq, asc } from "drizzle-orm";
import { requireCoach } from "@/lib/server/session";
import { registrationSchema } from "@/lib/registration-schema";
import { approveRegistration, rejectRegistration, requestFollowup } from "@/app/actions/registrations";
import { formatCents } from "@/lib/money";
import { UNREGISTERED_FAMILY_STATUS } from "@/lib/server/family-merge";

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

  // Quick-added divers still waiting on their family's registration. Any of
  // them can be linked to a diver on this submission instead of creating a
  // duplicate record; the closest name match is preselected.
  const unregistered = done ? [] : (await db.query.divers.findMany({
    where: and(eq(tables.divers.clubId, session.clubId), eq(tables.divers.status, "active")),
    with: { family: { with: { guardians: true } }, primaryGroup: true },
    orderBy: (d, { asc }) => [asc(d.legalName)],
  })).filter((d) => d.family.status === UNREGISTERED_FAMILY_STATUS);

  const norm = (x: string) => x.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const subEmails = p.guardians.map((g) => g.email.toLowerCase().trim());
  const subPhones = p.guardians.map((g) => g.phone.replace(/\D/g, "")).filter(Boolean);
  const usedSuggestions = new Set<string>();
  const suggestedLink = p.divers.map((d) => {
    const names = [d.legalName, d.preferredName].filter(Boolean).map((x) => norm(x!));
    const last = norm(d.legalName).split(" ").slice(-1)[0];
    const first = norm(d.preferredName || d.legalName).split(" ")[0];
    const scored = unregistered.map((u) => {
      const un = norm(u.legalName);
      const uParts = un.split(" ");
      const contactHit = u.family.guardians.some((g) =>
        (g.email && subEmails.includes(g.email.toLowerCase().trim())) ||
        (g.phone && subPhones.includes(g.phone.replace(/\D/g, ""))));
      let score = 0;
      if (names.includes(un)) score = 3;
      else if (uParts[0] === first && uParts[uParts.length - 1] === last) score = 3;
      else if (uParts[uParts.length - 1] === last && contactHit) score = 2;
      else if (uParts[0] === first && contactHit) score = 2;
      return { id: u.id, score };
    }).filter((x) => x.score >= 2 && !usedSuggestions.has(x.id)).sort((a, b) => b.score - a.score);
    const pick = scored[0]?.id ?? "";
    if (pick) usedSuggestions.add(pick);
    return pick;
  });

  // Possible-duplicate check: matching guardian email/phone, or a diver with
  // the same legal name + birth date, against families already in the club.
  // Informational only — approval always creates a new family; merging an
  // existing match in afterward is a deliberate, separate step.
  let possibleDuplicates: { id: string; billingName: string; reason: string }[] = [];
  if (!done) {
    const emails = p.guardians.map((g) => g.email.toLowerCase().trim());
    const phones = p.guardians.map((g) => g.phone.replace(/\D/g, "")).filter(Boolean);
    const clubFamilies = await db.query.families.findMany({
      where: and(eq(tables.families.clubId, session.clubId)),
      with: { guardians: true, divers: true },
    });
    const matches = new Map<string, string>();
    for (const f of clubFamilies) {
      for (const g of f.guardians) {
        const gEmail = g.email?.toLowerCase().trim();
        const gPhone = g.phone?.replace(/\D/g, "");
        if (gEmail && emails.includes(gEmail)) matches.set(f.id, `guardian email ${gEmail} matches`);
        else if (gPhone && phones.includes(gPhone)) matches.set(f.id, `guardian phone matches`);
      }
      for (const d of f.divers) {
        const nameHit = p.divers.some((pd) =>
          pd.birthDate === d.birthDate && pd.legalName.trim().toLowerCase() === d.legalName.trim().toLowerCase());
        if (nameHit) matches.set(f.id, `diver ${d.legalName} (same name + birth date)`);
      }
    }
    possibleDuplicates = clubFamilies
      .filter((f) => matches.has(f.id) && f.status !== UNREGISTERED_FAMILY_STATUS && f.status !== "merged")
      .map((f) => ({ id: f.id, billingName: f.billingName, reason: matches.get(f.id)! }));
  }

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

      {possibleDuplicates.length > 0 && (
        <section className="card p-4 border-warn bg-warn-soft">
          <h2 className="font-semibold text-warn">This might already be a family in the system</h2>
          <ul className="mt-2 text-sm space-y-1">
            {possibleDuplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/families/${d.id}`} className="font-semibold underline">{d.billingName}</Link>
                {" — "}{d.reason}
              </li>
            ))}
          </ul>
          <p className="text-sm mt-2">
            You can still approve as a new family below — this just flags a possible match. If it turns
            out to be the same family, open the resulting family record afterward and use{" "}
            <strong>Merge a duplicate family</strong> to combine them.
          </p>
        </section>
      )}

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

            {!done && unregistered.length > 0 && (
              <div className={`rounded-lg p-3 ${suggestedLink[i] ? "bg-warn-soft" : "bg-paper"}`}>
                <label className="label" htmlFor={`link_${i}`}>Link to a diver already on the roster?</label>
                <select id={`link_${i}`} name={`link_${i}`} className="input" defaultValue={suggestedLink[i]}>
                  <option value="">No — this is a new diver</option>
                  {unregistered.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.legalName}{u.primaryGroup ? ` · ${u.primaryGroup.name}` : ""} · added {u.startDate ?? u.createdAt.toISOString().slice(0, 10)} (not yet registered)
                    </option>
                  ))}
                </select>
                <p className="hint mt-1">
                  {suggestedLink[i] ? "Looks like a match — " : ""}Linking keeps their attendance and charges and fills in the
                  registration details. Leaving group or plan on &ldquo;Decide later&rdquo; keeps what they already have.
                </p>
              </div>
            )}

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
