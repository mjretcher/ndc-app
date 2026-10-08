"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/server/session";
import { recordAudit } from "@/lib/server/audit";
import { sendTemplatedEmail } from "@/lib/server/notify";
import { registrationSchema } from "@/lib/registration-schema";
import { todayYMD, addDaysYMD, type YMD } from "@/lib/dates";
import { repointFamilyRecords, UNREGISTERED_FAMILY_STATUS } from "@/lib/server/family-merge";

/**
 * Approve a submission: create family, guardians, divers, medical records,
 * membership records, and plan assignments per the coach's choices.
 * The submission payload itself is never modified.
 */
export async function approveRegistration(formData: FormData) {
  const session = await requireCoach();
  const submissionId = String(formData.get("submissionId"));

  const submission = await db.query.registrationSubmissions.findFirst({
    where: and(
      eq(tables.registrationSubmissions.id, submissionId),
      eq(tables.registrationSubmissions.clubId, session.clubId),
    ),
  });
  if (!submission) throw new Error("Submission not found.");
  if (submission.status === "approved") redirect(`/registrations/${submissionId}`);

  const payload = registrationSchema.parse(submission.payload);
  const today = todayYMD();

  // Optional per-diver link to a quick-added (not yet registered) diver.
  const linkIds = payload.divers.map((_, i) => String(formData.get(`link_${i}`) || "") || null);
  const chosen = linkIds.filter((x): x is string => !!x);
  if (new Set(chosen).size !== chosen.length) throw new Error("The same roster diver was linked to two registered divers.");
  const linkTargets = new Map<string, NonNullable<Awaited<ReturnType<typeof loadLinkTarget>>>>();
  async function loadLinkTarget(diverId: string) {
    return db.query.divers.findFirst({
      where: and(eq(tables.divers.id, diverId), eq(tables.divers.clubId, session.clubId)),
      with: { family: { with: { guardians: true } }, planAssignments: true, medical: true, memberships: true },
    });
  }
  for (const id of chosen) {
    const t = await loadLinkTarget(id);
    if (!t || t.status !== "active" || t.family.status !== UNREGISTERED_FAMILY_STATUS) {
      throw new Error("A diver you chose to link is no longer waiting on registration. Reload and try again.");
    }
    linkTargets.set(id, t);
  }

  const familyId = await db.transaction(async (tx) => {
    const [family] = await tx.insert(tables.families).values({
      clubId: session.clubId,
      billingName: payload.family.billingName,
      addressLine1: payload.family.addressLine1,
      addressLine2: payload.family.addressLine2 || null,
      city: payload.family.city,
      state: payload.family.state,
      zip: payload.family.zip,
    }).returning();

    for (let i = 0; i < payload.guardians.length; i++) {
      const g = payload.guardians[i];
      await tx.insert(tables.guardians).values({
        familyId: family.id,
        name: g.name,
        relationship: g.relationship || null,
        email: g.email,
        phone: g.phone,
        preferredContact: g.preferredContact,
        isPrimary: i === 0,
      });
    }
    // Emergency contact stored as a guardian-style row flagged emergency.
    await tx.insert(tables.guardians).values({
      familyId: family.id,
      name: payload.emergencyContact.name,
      relationship: payload.emergencyContact.relationship || "Emergency contact",
      phone: payload.emergencyContact.phone,
      isEmergencyContact: true,
    });

    for (let i = 0; i < payload.divers.length; i++) {
      const d = payload.divers[i];
      const groupId = String(formData.get(`group_${i}`) || "") || null;
      const planId = String(formData.get(`plan_${i}`) || "") || null;

      const linked = linkIds[i] ? linkTargets.get(linkIds[i]!)! : null;
      const diverFields = {
        familyId: family.id,
        legalName: d.legalName,
        preferredName: d.preferredName || null,
        birthDate: d.birthDate,
        school: d.school || null,
        grade: d.grade || null,
        experience: d.experience || null,
        activitiesNotes: d.activitiesNotes || null,
      };
      let diver: { id: string };
      if (linked) {
        // Reuse the quick-added diver so their attendance, charges, and
        // history stay attached; fill in everything from the registration.
        await tx.update(tables.divers).set({
          ...diverFields,
          primaryGroupId: groupId ?? linked.primaryGroupId,
        }).where(eq(tables.divers.id, linked.id));
        diver = { id: linked.id };
        if (linked.medical) await tx.delete(tables.diverMedical).where(eq(tables.diverMedical.id, linked.medical.id));
        for (const m of linked.memberships) {
          await tx.delete(tables.diverMemberships).where(eq(tables.diverMemberships.id, m.id));
        }
      } else {
        [diver] = await tx.insert(tables.divers).values({
          clubId: session.clubId,
          ...diverFields,
          status: "active",
          startDate: today,
          primaryGroupId: groupId,
        }).returning({ id: tables.divers.id });
      }

      if (d.allergies || d.medicalConsiderations || d.emergencyNotes) {
        await tx.insert(tables.diverMedical).values({
          diverId: diver.id,
          allergies: d.allergies || null,
          medicalConsiderations: d.medicalConsiderations || null,
          emergencyNotes: d.emergencyNotes || null,
        });
      }

      for (const [org, info] of [["aau", d.aau], ["usa_diving", d.usaDiving]] as const) {
        await tx.insert(tables.diverMemberships).values({
          diverId: diver.id,
          organization: org,
          membershipNumber: info.membershipNumber || null,
          membershipType: info.membershipType || null,
          expirationDate: info.expirationDate || null,
          verification: info.status === "have" && info.membershipNumber ? "pending" : "missing",
        });
      }

      if (planId) {
        const open = linked ? linked.planAssignments.filter((a) => a.effectiveEnd === null) : [];
        const alreadyOnPlan = open.some((a) => a.planId === planId);
        if (!alreadyOnPlan) {
          // Switch a linked diver's existing plan over as of today; earlier
          // practices keep billing under the plan they were on.
          for (const a of open) {
            if ((a.effectiveStart as YMD) < today) {
              await tx.update(tables.diverPlanAssignments).set({ effectiveEnd: addDaysYMD(today, -1) })
                .where(eq(tables.diverPlanAssignments.id, a.id));
            } else {
              await tx.delete(tables.diverPlanAssignments).where(eq(tables.diverPlanAssignments.id, a.id));
            }
          }
          await tx.insert(tables.diverPlanAssignments).values({
            diverId: diver.id,
            planId,
            effectiveStart: today,
          });
        }
      }

      await tx.insert(tables.waivers).values({
        familyId: family.id,
        diverId: diver.id,
        waiverType: "registration",
        version: "v1",
        acceptedName: payload.waiver.signatureName,
        acceptedAt: submission.submittedAt,
      });
    }

    // Fold each linked diver's placeholder family into the new one: charges,
    // invoices, credits, discounts, and any siblings move over. Coach-entered
    // contacts that duplicate a registered guardian are dropped.
    const placeholderIds = new Set([...linkTargets.values()].map((t) => t.familyId));
    const regEmails = payload.guardians.map((g) => g.email.toLowerCase().trim());
    const regPhones = payload.guardians.map((g) => g.phone.replace(/\D/g, "")).filter(Boolean);
    for (const placeholderId of placeholderIds) {
      const placeholder = [...linkTargets.values()].find((t) => t.familyId === placeholderId)!.family;
      for (const g of placeholder.guardians) {
        const dupe = (g.email && regEmails.includes(g.email.toLowerCase().trim())) ||
          (g.phone && regPhones.includes(g.phone.replace(/\D/g, ""))) ||
          (!g.email && !g.phone);
        if (dupe) await tx.delete(tables.guardians).where(eq(tables.guardians.id, g.id));
        else await tx.update(tables.guardians).set({ familyId: family.id, isPrimary: false }).where(eq(tables.guardians.id, g.id));
      }
      await repointFamilyRecords(tx, placeholderId, family.id);
      await tx.update(tables.families).set({
        status: "merged",
        notes: `${placeholder.notes ? placeholder.notes + "\n\n" : ""}Linked to registration "${payload.family.billingName}" (${family.id}) on ${today}.`,
      }).where(eq(tables.families.id, placeholderId));
    }

    // Activate the family's portal login, if they set a password at submission.
    if (submission.passwordHash) {
      const primaryEmail = payload.guardians[0].email.toLowerCase().trim();
      const existingUser = await tx.query.users.findFirst({ where: eq(tables.users.email, primaryEmail) });
      if (!existingUser) {
        const [newUser] = await tx.insert(tables.users).values({
          email: primaryEmail,
          name: payload.guardians[0].name,
          passwordHash: submission.passwordHash,
          active: true,
        }).returning({ id: tables.users.id });
        await tx.insert(tables.clubMemberships).values({
          clubId: session.clubId,
          userId: newUser.id,
          role: "family",
          familyId: family.id,
          active: true,
        });
      } else {
        // Email already has a login (e.g. an admin created one, or they
        // registered before under another family). Don't overwrite an
        // existing password or create a duplicate membership — just make
        // sure this family is reachable from that login going forward.
        const existingMembership = await tx.query.clubMemberships.findFirst({
          where: and(eq(tables.clubMemberships.userId, existingUser.id), eq(tables.clubMemberships.clubId, session.clubId)),
        });
        if (!existingMembership) {
          await tx.insert(tables.clubMemberships).values({
            clubId: session.clubId, userId: existingUser.id, role: "family", familyId: family.id, active: true,
          });
        }
      }
    }

    await tx.update(tables.registrationSubmissions).set({
      status: "approved",
      reviewerUserId: session.userId,
      reviewedAt: new Date(),
      resultingFamilyId: family.id,
    }).where(eq(tables.registrationSubmissions.id, submission.id));

    await recordAudit(tx, {
      clubId: session.clubId,
      actorUserId: session.userId,
      action: "registration.approve",
      entityType: "registration_submission",
      entityId: submission.id,
      summary: `Approved registration for ${payload.family.billingName} (${payload.divers.length} diver${payload.divers.length === 1 ? "" : "s"})`,
      after: { familyId: family.id, linkedDiverIds: chosen },
    });

    return family.id;
  });

  // Approval email (after commit)
  const groupNames = await db.query.groups.findMany({ where: eq(tables.groups.clubId, session.clubId) });
  const plans = await db.query.billingPlans.findMany({ where: eq(tables.billingPlans.clubId, session.clubId) });
  const groupSummary = payload.divers.map((d, i) => {
    const gid = String(formData.get(`group_${i}`) || "");
    const g = groupNames.find((x) => x.id === gid);
    return `${d.preferredName || d.legalName}: ${g?.name ?? "to be confirmed"}`;
  }).join("; ");
  const planSummary = payload.divers.map((d, i) => {
    const pid = String(formData.get(`plan_${i}`) || "");
    const p = plans.find((x) => x.id === pid);
    return `${d.preferredName || d.legalName}: ${p?.name ?? "to be confirmed"}`;
  }).join("; ");
  const diverNames = payload.divers.map((d) => d.preferredName || d.legalName).join(", ");
  await sendTemplatedEmail({
    clubId: session.clubId,
    eventType: "registration_approved",
    recipientEmail: payload.guardians[0].email,
    fields: {
      guardian_name: payload.guardians[0].name,
      diver_names: diverNames,
      is_are: payload.divers.length === 1 ? "is" : "are",
      group_summary: groupSummary,
      plan_summary: planSummary,
    },
    idempotencyKey: `registration_approved:${submissionId}`,
  });

  revalidatePath("/registrations");
  revalidatePath("/families");
  redirect(`/families/${familyId}`);
}

export async function rejectRegistration(formData: FormData) {
  const session = await requireCoach();
  const submissionId = String(formData.get("submissionId"));
  const notes = String(formData.get("notes") ?? "");
  await db.transaction(async (tx) => {
    await tx.update(tables.registrationSubmissions).set({
      status: "rejected",
      reviewNotes: notes || null,
      reviewerUserId: session.userId,
      reviewedAt: new Date(),
    }).where(and(
      eq(tables.registrationSubmissions.id, submissionId),
      eq(tables.registrationSubmissions.clubId, session.clubId),
    ));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "registration.reject", entityType: "registration_submission", entityId: submissionId,
      summary: `Rejected registration${notes ? `: ${notes}` : ""}`,
    });
  });
  revalidatePath("/registrations");
  redirect("/registrations");
}

export async function requestFollowup(formData: FormData) {
  const session = await requireCoach();
  const submissionId = String(formData.get("submissionId"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (!notes) throw new Error("Add a note describing what you need from the family.");

  const submission = await db.query.registrationSubmissions.findFirst({
    where: and(
      eq(tables.registrationSubmissions.id, submissionId),
      eq(tables.registrationSubmissions.clubId, session.clubId),
    ),
  });
  if (!submission) throw new Error("Submission not found.");
  const payload = registrationSchema.parse(submission.payload);

  await db.transaction(async (tx) => {
    await tx.update(tables.registrationSubmissions).set({
      status: "needs_followup",
      reviewNotes: notes,
      reviewerUserId: session.userId,
      reviewedAt: new Date(),
    }).where(eq(tables.registrationSubmissions.id, submissionId));
    await recordAudit(tx, {
      clubId: session.clubId, actorUserId: session.userId,
      action: "registration.followup", entityType: "registration_submission", entityId: submissionId,
      summary: `Requested follow-up: ${notes}`,
    });
  });

  await sendTemplatedEmail({
    clubId: session.clubId,
    eventType: "registration_followup",
    recipientEmail: payload.guardians[0].email,
    fields: {
      guardian_name: payload.guardians[0].name,
      diver_names: payload.divers.map((d) => d.preferredName || d.legalName).join(", "),
      followup_notes: notes,
    },
  });

  revalidatePath("/registrations");
  redirect("/registrations");
}
