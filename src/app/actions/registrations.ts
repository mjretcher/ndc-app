"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoach } from "@/lib/server/session";
import { recordAudit } from "@/lib/server/audit";
import { sendTemplatedEmail } from "@/lib/server/notify";
import { registrationSchema } from "@/lib/registration-schema";
import { todayYMD } from "@/lib/dates";

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

      const [diver] = await tx.insert(tables.divers).values({
        clubId: session.clubId,
        familyId: family.id,
        legalName: d.legalName,
        preferredName: d.preferredName || null,
        birthDate: d.birthDate,
        school: d.school || null,
        grade: d.grade || null,
        experience: d.experience || null,
        activitiesNotes: d.activitiesNotes || null,
        status: "active",
        startDate: today,
        primaryGroupId: groupId,
      }).returning();

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
        await tx.insert(tables.diverPlanAssignments).values({
          diverId: diver.id,
          planId,
          effectiveStart: today,
        });
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
      after: { familyId: family.id },
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
