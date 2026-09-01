import "server-only";
import { db, tables } from "@/db";
import { and, eq, lt } from "drizzle-orm";

/**
 * Email notification service.
 * - Templates are stored in the database and editable in the app.
 * - Every send goes through notification_jobs (send log + retry + idempotency).
 * - The delivery driver is selected by env: RESEND_API_KEY set -> Resend,
 *   otherwise a log driver so development never emails real people.
 * - Never include medical details in any merge field. Templates only receive
 *   the whitelisted fields passed here.
 */

export type MergeFields = Record<string, string>;

export function renderTemplate(text: string, fields: MergeFields): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => fields[key] ?? "");
}

async function deliver(job: { recipientEmail: string; subject: string; body: string }): Promise<{ ok: boolean; skipped?: boolean; providerId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Napoleon Diving Club <onboarding@resend.dev>";
  if (!apiKey) {
    // No email provider configured yet. This is NOT a successful send — nothing
    // leaves the server. Callers must record this as "skipped", not "sent", or
    // the notification log will falsely claim delivery that never happened.
    console.log(`[email:no-provider-configured] would have sent to=${job.recipientEmail} subject="${job.subject}"`);
    return { ok: false, skipped: true, providerId: undefined };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const res = await resend.emails.send({
      from, to: job.recipientEmail, subject: job.subject, text: job.body,
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, providerId: res.data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Queue and immediately attempt an email built from a stored template.
 * `idempotencyKey` prevents duplicate sends (e.g. re-issuing the same invoice
 * email). Returns silently if the template is inactive or already sent.
 */
export async function sendTemplatedEmail(opts: {
  clubId: string;
  eventType: string;
  recipientEmail: string;
  fields: MergeFields;
  idempotencyKey?: string;
}): Promise<void> {
  const template = await db.query.notificationTemplates.findFirst({
    where: and(
      eq(tables.notificationTemplates.clubId, opts.clubId),
      eq(tables.notificationTemplates.eventType, opts.eventType),
    ),
  });
  if (!template || !template.active) return;

  const subject = renderTemplate(template.subject, opts.fields);
  const body = renderTemplate(template.body, opts.fields);

  let jobId: string | null = null;
  try {
    const [job] = await db.insert(tables.notificationJobs).values({
      clubId: opts.clubId,
      eventType: opts.eventType,
      recipientEmail: opts.recipientEmail,
      subject, body,
      idempotencyKey: opts.idempotencyKey ?? null,
      status: "queued",
    }).returning({ id: tables.notificationJobs.id });
    jobId = job.id;
  } catch {
    // Unique violation on idempotencyKey -> already queued/sent. Skip.
    return;
  }

  const result = await deliver({ recipientEmail: opts.recipientEmail, subject, body });
  await db.update(tables.notificationJobs).set({
    status: result.skipped ? "skipped" : result.ok ? "sent" : "failed",
    attempts: 1,
    providerId: result.providerId ?? null,
    lastError: result.skipped ? "No email provider configured (RESEND_API_KEY not set)" : (result.error ?? null),
    sentAt: result.ok ? new Date() : null,
  }).where(eq(tables.notificationJobs.id, jobId));
}

/** Retry transient failures (invoked from the notification log screen). */
export async function retryFailedJobs(clubId: string, maxAttempts = 3): Promise<number> {
  const failed = await db.query.notificationJobs.findMany({
    where: and(
      eq(tables.notificationJobs.clubId, clubId),
      eq(tables.notificationJobs.status, "failed"),
      lt(tables.notificationJobs.attempts, maxAttempts),
    ),
  });
  let retried = 0;
  for (const job of failed) {
    const result = await deliver(job);
    await db.update(tables.notificationJobs).set({
      status: result.skipped ? "skipped" : result.ok ? "sent" : "failed",
      attempts: job.attempts + 1,
      providerId: result.providerId ?? job.providerId,
      lastError: result.skipped ? "No email provider configured (RESEND_API_KEY not set)" : (result.error ?? null),
      sentAt: result.ok ? new Date() : null,
    }).where(eq(tables.notificationJobs.id, job.id));
    if (result.ok) retried++;
  }
  return retried;
}
