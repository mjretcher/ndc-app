import { db, tables } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@/lib/server/audit";
import { syncPracticeCharges } from "@/lib/server/charge-sync";
import { notifyPracticeFamilies } from "@/app/actions/practices";

export const dynamic = "force-dynamic";

/**
 * Checks every "requires sign-up" practice that's still scheduled and whose
 * cutoff (default 24h before start) has passed. If attending RSVPs are below
 * the configured minimum, the practice is auto-canceled and families are
 * notified through the existing "practice_canceled" template.
 *
 * Idempotent by design: once a practice is canceled (or has enough sign-ups
 * and simply ages past its cutoff), it will never match this query again, so
 * calling this more than once — or more than once an hour — is harmless.
 *
 * Triggered by a GitHub Actions scheduled workflow rather than Vercel's own
 * cron, because Vercel's Hobby plan only allows once-per-day schedules and
 * this needs to resolve close to an exact hour each week (see repo README).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  const candidates = await db.query.practices.findMany({
    where: and(
      eq(tables.practices.status, "scheduled"),
      eq(tables.practices.requiresSignup, true),
      isNull(tables.practices.signupCheckedAt),
    ),
  });

  const results: Array<{ practiceId: string; action: string; attending: number }> = [];

  for (const practice of candidates) {
    const cutoffHours = practice.signupCutoffHours ?? 24;
    const cutoffAt = new Date(new Date(practice.startsAt).getTime() - cutoffHours * 60 * 60 * 1000);
    if (now < cutoffAt) continue; // not at the cutoff yet

    const minCount = practice.minSignupCount ?? 0;
    const rsvps = await db.query.practiceRsvps.findMany({
      where: eq(tables.practiceRsvps.practiceId, practice.id),
    });
    const attending = rsvps.filter((r) => r.status === "attending").length;

    if (attending >= minCount) {
      // Enough sign-ups: nothing to do, but stamp it so we don't re-check every hour.
      await db.update(tables.practices).set({ signupCheckedAt: now }).where(eq(tables.practices.id, practice.id));
      results.push({ practiceId: practice.id, action: "confirmed", attending });
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.update(tables.practices)
        .set({ status: "canceled", autoCanceledAt: now, signupCheckedAt: now })
        .where(eq(tables.practices.id, practice.id));
      await recordAudit(tx, {
        clubId: practice.clubId,
        actorUserId: null,
        action: "practice.auto_cancel_low_signup",
        entityType: "practice",
        entityId: practice.id,
        summary: `Auto-canceled: ${attending} attending, needed ${minCount} by ${cutoffHours}h before start.`,
      });
    });
    await syncPracticeCharges(practice.id, null);
    await notifyPracticeFamilies(
      practice.clubId,
      practice.id,
      "practice_canceled",
      `Not enough divers had signed up (${attending} of ${minCount} needed), so this practice is canceled.`,
    );
    results.push({ practiceId: practice.id, action: "canceled", attending });
  }

  return Response.json({ checked: candidates.length, results });
}
