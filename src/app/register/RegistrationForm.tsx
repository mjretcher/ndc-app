"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import {
  registrationSchema, emptyDiver, type RegistrationPayload,
} from "@/lib/registration-schema";
import { PasswordInput } from "@/components/PasswordInput";

type DiverDraft = ReturnType<typeof emptyDiver>;
type GuardianDraft = {
  name: string; relationship: string; email: string; phone: string;
  preferredContact: "email" | "phone" | "text"; isEmergencyContact: boolean;
};

const STEPS = ["Family", "Divers", "Billing", "Review & sign"] as const;

const emptyGuardian = (): GuardianDraft => ({
  name: "", relationship: "", email: "", phone: "", preferredContact: "email", isEmergencyContact: false,
});

export function RegistrationForm() {
  const [step, setStep] = useState(0);
  const [family, setFamily] = useState({ billingName: "", addressLine1: "", addressLine2: "", city: "", state: "OH", zip: "" });
  const [guardians, setGuardians] = useState<GuardianDraft[]>([emptyGuardian()]);
  const [emergency, setEmergency] = useState({ name: "", phone: "", relationship: "" });
  const [divers, setDivers] = useState<DiverDraft[]>([emptyDiver()]);
  const [billingPreference, setBillingPreference] = useState<RegistrationPayload["billingPreference"]>("unsure");
  const [waiver, setWaiver] = useState({ acknowledgedRisk: false, acknowledgedPlacement: false, acknowledgedPrivacy: false, signatureName: "" });
  const [account, setAccount] = useState({ password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const payload = useMemo(() => ({
    family,
    guardians,
    emergencyContact: emergency,
    divers,
    billingPreference,
    waiver: { ...waiver, signatureDate: new Date().toISOString().slice(0, 10) },
  }), [family, guardians, emergency, divers, billingPreference, waiver]);

  function validateStep(i: number): string[] {
    const problems: string[] = [];
    const collect = (r: z.ZodSafeParseResult<unknown>) => {
      if (!r.success) {
        for (const issue of r.error.issues) problems.push(issue.message);
      }
    };
    if (i === 0) {
      collect(registrationSchema.shape.family.safeParse(family));
      collect(registrationSchema.shape.guardians.safeParse(guardians));
      collect(registrationSchema.shape.emergencyContact.safeParse(emergency));
    }
    if (i === 1) collect(registrationSchema.shape.divers.safeParse(divers));
    if (i === 3) collect(registrationSchema.shape.waiver.safeParse({ ...waiver, signatureDate: "2026-01-01" }));
    if (i === 3) {
      if (account.password.length < 8) problems.push("Password must be at least 8 characters");
      if (account.password !== account.confirmPassword) problems.push("Passwords don't match");
    }
    return [...new Set(problems)];
  }

  function next() {
    const problems = validateStep(step);
    setErrors(problems);
    if (problems.length === 0) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo({ top: 0 });
    }
  }

  async function submit() {
    const problems = validateStep(3);
    setErrors(problems);
    if (problems.length > 0) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, password: account.password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setServerError(data.error ?? "Something went wrong saving your registration. Please try again.");
        return;
      }
      setDone(data.submissionId);
    } catch {
      setServerError("We couldn't reach the server. Check your connection and try again — nothing was lost.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="card p-6 text-center">
        <p className="text-4xl" aria-hidden>🤿</p>
        <h2 className="display text-xl mt-2">Registration received</h2>
        <p className="mt-2 text-mute">
          Thanks! A coach will review your submission and follow up by email
          about group placement and next steps. You&apos;ll hear from us soon.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Stepper */}
      <ol className="flex gap-1.5 mb-5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-navy" : "bg-line"}`} />
            <span className={`mt-1 block text-[0.7rem] font-semibold ${i === step ? "text-navy" : "text-mute"}`}>{label}</span>
          </li>
        ))}
      </ol>

      {errors.length > 0 && (
        <div role="alert" className="card border-danger bg-danger-soft p-4 mb-4">
          <p className="font-semibold text-danger text-sm">Before continuing:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-danger">
            {errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {step === 0 && (
        <div className="space-y-5">
          <section className="card p-4 md:p-5 space-y-3">
            <h2 className="display text-lg">Family</h2>
            <div>
              <label className="label" htmlFor="billingName">Family name (for billing)</label>
              <input id="billingName" className="input" value={family.billingName} placeholder="The Smith family"
                onChange={(e) => setFamily({ ...family, billingName: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="addr1">Street address</label>
              <input id="addr1" className="input" autoComplete="address-line1" value={family.addressLine1}
                onChange={(e) => setFamily({ ...family, addressLine1: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="addr2">Apt / unit <span className="font-normal text-mute">(optional)</span></label>
              <input id="addr2" className="input" autoComplete="address-line2" value={family.addressLine2}
                onChange={(e) => setFamily({ ...family, addressLine2: e.target.value })} />
            </div>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3">
                <label className="label" htmlFor="city">City</label>
                <input id="city" className="input" autoComplete="address-level2" value={family.city}
                  onChange={(e) => setFamily({ ...family, city: e.target.value })} />
              </div>
              <div className="col-span-1">
                <label className="label" htmlFor="state">State</label>
                <input id="state" className="input" autoComplete="address-level1" value={family.state}
                  onChange={(e) => setFamily({ ...family, state: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor="zip">ZIP</label>
                <input id="zip" className="input" inputMode="numeric" autoComplete="postal-code" value={family.zip}
                  onChange={(e) => setFamily({ ...family, zip: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="card p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="display text-lg">Parents / guardians</h2>
              {guardians.length < 4 && (
                <button type="button" className="btn btn-secondary !min-h-9 text-sm" onClick={() => setGuardians([...guardians, emptyGuardian()])}>
                  Add guardian
                </button>
              )}
            </div>
            {guardians.map((g, i) => (
              <fieldset key={i} className="rounded-lg border border-line p-3 space-y-3">
                <legend className="eyebrow px-1">Guardian {i + 1}</legend>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor={`gname${i}`}>Full name</label>
                    <input id={`gname${i}`} className="input" value={g.name}
                      onChange={(e) => setGuardians(guardians.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`grel${i}`}>Relationship <span className="font-normal text-mute">(optional)</span></label>
                    <input id={`grel${i}`} className="input" placeholder="Mom, Dad, Grandparent…" value={g.relationship}
                      onChange={(e) => setGuardians(guardians.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`gemail${i}`}>Email</label>
                    <input id={`gemail${i}`} type="email" className="input" value={g.email}
                      onChange={(e) => setGuardians(guardians.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`gphone${i}`}>Phone</label>
                    <input id={`gphone${i}`} type="tel" className="input" value={g.phone}
                      onChange={(e) => setGuardians(guardians.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="label !mb-0" htmlFor={`gpref${i}`}>Preferred contact</label>
                  <select id={`gpref${i}`} className="input !w-auto" value={g.preferredContact}
                    onChange={(e) => setGuardians(guardians.map((x, j) => j === i ? { ...x, preferredContact: e.target.value as GuardianDraft["preferredContact"] } : x))}>
                    <option value="email">Email</option>
                    <option value="phone">Phone call</option>
                    <option value="text">Text</option>
                  </select>
                  {guardians.length > 1 && (
                    <button type="button" className="text-sm text-danger font-semibold ml-auto"
                      onClick={() => setGuardians(guardians.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </div>
              </fieldset>
            ))}
          </section>

          <section className="card p-4 md:p-5 space-y-3">
            <h2 className="display text-lg">Emergency contact</h2>
            <p className="hint">Who should we call first if we can&apos;t reach a guardian?</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="label" htmlFor="ecname">Name</label>
                <input id="ecname" className="input" value={emergency.name}
                  onChange={(e) => setEmergency({ ...emergency, name: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="ecphone">Phone</label>
                <input id="ecphone" type="tel" className="input" value={emergency.phone}
                  onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="ecrel">Relationship <span className="font-normal text-mute">(optional)</span></label>
                <input id="ecrel" className="input" value={emergency.relationship}
                  onChange={(e) => setEmergency({ ...emergency, relationship: e.target.value })} />
              </div>
            </div>
          </section>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          {divers.map((d, i) => (
            <section key={i} className="card p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="display text-lg">Diver {divers.length > 1 ? i + 1 : ""}</h2>
                {divers.length > 1 && (
                  <button type="button" className="text-sm text-danger font-semibold"
                    onClick={() => setDivers(divers.filter((_, j) => j !== i))}>
                    Remove diver
                  </button>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor={`dlegal${i}`}>Legal name</label>
                  <input id={`dlegal${i}`} className="input" value={d.legalName}
                    onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, legalName: e.target.value } : x))} />
                </div>
                <div>
                  <label className="label" htmlFor={`dpref${i}`}>Preferred name <span className="font-normal text-mute">(optional)</span></label>
                  <input id={`dpref${i}`} className="input" value={d.preferredName}
                    onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, preferredName: e.target.value } : x))} />
                </div>
                <div>
                  <label className="label" htmlFor={`dbday${i}`}>Birth date</label>
                  <input id={`dbday${i}`} type="date" className="input" value={d.birthDate}
                    onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, birthDate: e.target.value } : x))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor={`dschool${i}`}>School</label>
                    <input id={`dschool${i}`} className="input" value={d.school}
                      onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, school: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`dgrade${i}`}>Grade</label>
                    <input id={`dgrade${i}`} className="input" value={d.grade}
                      onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, grade: e.target.value } : x))} />
                  </div>
                </div>
              </div>
              <div>
                <label className="label" htmlFor={`dexp${i}`}>Diving / gymnastics / swim experience</label>
                <textarea id={`dexp${i}`} rows={2} className="input" placeholder="Any prior experience — totally fine if none!" value={d.experience}
                  onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, experience: e.target.value } : x))} />
              </div>
              <div>
                <label className="label" htmlFor={`dact${i}`}>Other activities &amp; schedule notes <span className="font-normal text-mute">(optional)</span></label>
                <textarea id={`dact${i}`} rows={2} className="input" placeholder="Sports, band, anything that affects practice days" value={d.activitiesNotes}
                  onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, activitiesNotes: e.target.value } : x))} />
              </div>

              <details className="rounded-lg border border-line p-3">
                <summary className="font-semibold cursor-pointer">Safety &amp; medical</summary>
                <p className="hint mt-2">
                  Shared only with coaching staff. Never included in emails.
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="label" htmlFor={`dallergy${i}`}>Allergies</label>
                    <textarea id={`dallergy${i}`} rows={2} className="input" value={d.allergies}
                      onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, allergies: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`dmed${i}`}>Medical considerations</label>
                    <textarea id={`dmed${i}`} rows={2} className="input" placeholder="Asthma, seizures, injuries, medications…" value={d.medicalConsiderations}
                      onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, medicalConsiderations: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`demn${i}`}>Anything else coaches should know in an emergency</label>
                    <textarea id={`demn${i}`} rows={2} className="input" value={d.emergencyNotes}
                      onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, emergencyNotes: e.target.value } : x))} />
                  </div>
                </div>
              </details>

              {(["aau", "usaDiving"] as const).map((org) => (
                <details key={org} className="rounded-lg border border-line p-3">
                  <summary className="font-semibold cursor-pointer">
                    {org === "aau" ? "AAU membership" : "USA Diving membership"}
                    <span className="ml-2 chip chip-mute">{d[org].status === "have" ? "Have it" : "Not yet"}</span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      {(["not_yet", "have"] as const).map((s) => (
                        <button key={s} type="button"
                          className={`btn ${d[org].status === s ? "btn-primary" : "btn-secondary"} !min-h-10 text-sm`}
                          onClick={() => setDivers(divers.map((x, j) => j === i ? { ...x, [org]: { ...x[org], status: s } } : x))}>
                          {s === "have" ? "We have one" : "Not yet"}
                        </button>
                      ))}
                    </div>
                    {d[org].status === "have" ? (
                      <div className="grid md:grid-cols-3 gap-3">
                        <div>
                          <label className="label">Membership number</label>
                          <input className="input" value={d[org].membershipNumber}
                            onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, [org]: { ...x[org], membershipNumber: e.target.value } } : x))} />
                        </div>
                        <div>
                          <label className="label">Type</label>
                          <input className="input" placeholder={org === "aau" ? "Extended Coverage (AB)" : "Athlete"} value={d[org].membershipType}
                            onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, [org]: { ...x[org], membershipType: e.target.value } } : x))} />
                        </div>
                        <div>
                          <label className="label">Expires</label>
                          <input type="date" className="input" value={d[org].expirationDate}
                            onChange={(e) => setDivers(divers.map((x, j) => j === i ? { ...x, [org]: { ...x[org], expirationDate: e.target.value } } : x))} />
                        </div>
                      </div>
                    ) : (
                      <p className="hint">
                        No problem — after approval we&apos;ll email step-by-step
                        instructions for getting one.
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </section>
          ))}
          {divers.length < 8 && (
            <button type="button" className="btn btn-secondary w-full" onClick={() => setDivers([...divers, emptyDiver()])}>
              Add another diver
            </button>
          )}
        </div>
      )}

      {step === 2 && (
        <section className="card p-4 md:p-5 space-y-4">
          <h2 className="display text-lg">Billing preference</h2>
          <p className="hint">
            This just tells the coaches what you&apos;re leaning toward — Coach
            will confirm the right plan with you before anything is billed.
          </p>
          <div className="space-y-2" role="radiogroup" aria-label="Billing preference">
            {([
              ["flat_monthly", "Monthly flat rate", "One set amount per month for your diver's group"],
              ["per_practice", "Pay per practice", "Only pay for practices attended"],
              ["high_school", "High school season only", "Nov–Feb season, billed in installments"],
              ["unsure", "Not sure yet", "Talk it through with Coach first"],
            ] as const).map(([value, title, desc]) => (
              <label key={value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${billingPreference === value ? "border-navy bg-pool" : "border-line"}`}>
                <input type="radio" name="billing" className="mt-1" checked={billingPreference === value}
                  onChange={() => setBillingPreference(value)} />
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-mute">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <section className="card p-4 md:p-5">
            <h2 className="display text-lg">Review</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="inline font-semibold">Family:</dt> <dd className="inline">{family.billingName}, {family.city}, {family.state}</dd></div>
              <div><dt className="inline font-semibold">Guardians:</dt> <dd className="inline">{guardians.map((g) => g.name).filter(Boolean).join(", ")}</dd></div>
              <div><dt className="inline font-semibold">Divers:</dt> <dd className="inline">{divers.map((d) => d.preferredName || d.legalName).filter(Boolean).join(", ")}</dd></div>
              <div><dt className="inline font-semibold">Billing preference:</dt> <dd className="inline">{
                { flat_monthly: "Monthly flat rate", per_practice: "Pay per practice", high_school: "High school season", unsure: "Not sure yet" }[billingPreference]
              }</dd></div>
            </dl>
          </section>
          <section className="card p-4 md:p-5 space-y-3">
            <h2 className="display text-lg">Create your family login</h2>
            <p className="hint">
              This lets you sign in later to sign up for practices and update RSVPs.
              It becomes active once a coach approves your registration.
            </p>
            <div>
              <label className="label" htmlFor="acct-pw">Password</label>
              <PasswordInput id="acct-pw" autoComplete="new-password"
                value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="acct-pw2">Confirm password</label>
              <PasswordInput id="acct-pw2" autoComplete="new-password"
                value={account.confirmPassword} onChange={(e) => setAccount({ ...account, confirmPassword: e.target.value })} />
            </div>
          </section>
          <section className="card p-4 md:p-5 space-y-3">
            <h2 className="display text-lg">Acknowledgment &amp; signature</h2>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={waiver.acknowledgedRisk}
                onChange={(e) => setWaiver({ ...waiver, acknowledgedRisk: e.target.checked })} />
              <span className="text-sm">
                I understand diving is a physical activity that carries inherent
                risk, and I consent to my diver(s) participating in Napoleon
                Diving Club practices and events.
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={waiver.acknowledgedPlacement}
                onChange={(e) => setWaiver({ ...waiver, acknowledgedPlacement: e.target.checked })} />
              <span className="text-sm">
                I understand group placement and billing plan are confirmed by a
                coach after review, and registration is not final until then.
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={waiver.acknowledgedPrivacy}
                onChange={(e) => setWaiver({ ...waiver, acknowledgedPrivacy: e.target.checked })} />
              <span className="text-sm">
                The information provided is accurate, and medical details may be
                shared with NDC coaching staff for safety purposes.
              </span>
            </label>
            <div>
              <label className="label" htmlFor="sig">Type your full name to sign</label>
              <input id="sig" className="input" autoComplete="name" value={waiver.signatureName}
                onChange={(e) => setWaiver({ ...waiver, signatureName: e.target.value })} />
              <p className="hint mt-1">Signed {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            </div>
          </section>
          {serverError && <p role="alert" className="error-text">{serverError}</p>}
        </div>
      )}

      {/* Honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => { setErrors([]); setStep(step - 1); window.scrollTo({ top: 0 }); }}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary flex-1" onClick={next}>Continue</button>
        ) : (
          <button type="button" className="btn btn-primary flex-1" onClick={submit} disabled={submitting}>
            {submitting ? "Sending…" : "Send registration"}
          </button>
        )}
      </div>
    </div>
  );
}
