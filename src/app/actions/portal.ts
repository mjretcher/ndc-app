"use server";

import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireFamily } from "@/lib/server/session";

/**
 * Family self-service RSVP. Enforces that the diver belongs to the acting
 * guardian's own family, and that the practice is still scheduled (you can't
 * sign up for or cancel out of a practice that's already been canceled).
 */
export async function setRsvp(formData: FormData) {
  const session = await requireFamily();
  const diverId = String(formData.get("diverId") || "");
  const practiceId = String(formData.get("practiceId") || "");
  const status = String(formData.get("status") || "");
  const weekOffset = String(formData.get("weekOffset") || "0");

  if (!["attending", "not_attending"].includes(status)) {
    throw new Error("Invalid RSVP status.");
  }

  const diver = await db.query.divers.findFirst({
    where: and(eq(tables.divers.id, diverId), eq(tables.divers.familyId, session.familyId)),
  });
  if (!diver) throw new Error("That diver isn't on your family account.");

  const practice = await db.query.practices.findFirst({
    where: and(eq(tables.practices.id, practiceId), eq(tables.practices.clubId, session.clubId)),
  });
  if (!practice) throw new Error("Practice not found.");
  if (practice.status !== "scheduled") throw new Error("This practice is no longer scheduled.");

  await db
    .insert(tables.practiceRsvps)
    .values({
      practiceId,
      diverId,
      status: status as "attending" | "not_attending",
      respondedByUserId: session.userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tables.practiceRsvps.practiceId, tables.practiceRsvps.diverId],
      set: { status: status as "attending" | "not_attending", respondedByUserId: session.userId, updatedAt: new Date() },
    });

  revalidatePath("/portal");
  redirect(`/portal?week=${weekOffset}`);
}
