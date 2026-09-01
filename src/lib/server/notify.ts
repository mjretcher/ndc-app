import "server-only";
import { db, tables } from "@/db";
import { and, eq, lt } from "drizzle-orm";

/**
 * Email notification service.
 * - Templates are stored in the database and editable in the app.
 * - Every send goes through notification_jobs (send log + retry + idempotency).
 * - Delivery driver, in priority order:
 *     1. Resend (RESEND_API_KEY set) — the intended long-term path, once a
 *        custom domain is verified with Resend for proper branded sending.
 *     2. Gmail SMTP relay (GMAIL_USER + GMAIL_APP_PASSWORD set) — a stopgap
 *        that sends real email through a Gmail account today, no domain
 *        needed. Mail reads as coming from that Gmail address.
 *     3. Neither configured -> log-only. Nothing is sent to a real inbox.
 *   Once Resend is configured, it's used automatically even if the Gmail
 *   vars are still set — no code change needed to "switch over" later.
 * - Never include medical details in any merge field. Templates only receive
 *   the whitelisted fields passed here.
 */

export type MergeFields = Record<string, string>;

export function renderTemplate(text: string, fields: MergeFields): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => fields[key] ?? "");
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY || !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** Human-readable label for whichever driver is currently active, for display in Settings. */
export function activeEmailProviderLabel(): string | null {
  if (process.env.RESEND_API_KEY) return `Resend (from ${process.env.EMAIL_FROM ?? "onboarding@resend.dev"})`;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return `Gmail relay (from ${process.env.GMAIL_USER})`;
  return null;
}

async function deliverViaResend(apiKey: string, job: { recipientEmail: string; subject: string; body: string }) {
  const from = process.env.EMAIL_FROM ?? "Napoleon Diving Club <onboarding@resend.dev>";
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

async function deliverViaGmail(user: string, appPassword: string, job: { recipientEmail: string; subject: string; body: string }) {
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      service: "gmail",
      auth: { user, pass: appPassword },
    });
    const info = await transporter.sendMail({
      from: `"Napoleon Diving Club" <${user}>`,
      to: job.recipientEmail,
      subject: job.subject,
      text: job.body,
    });
    return { ok: true, providerId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function deliver(job: { recipientEmail: string; subject: string; body: string }): Promise<{ ok: boolean; skipped?: boolean; providerId?: string; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (resendKey) return deliverViaResend(resendKey, job);
  if (gmailUser && gmailPass) return deliverViaGmail(gmailUser, gmailPass, job);

  // No email provider configured yet. This is NOT a successful send — nothing
  // leaves the server. Callers must record this as "skipped", not "sent", or
  // the notification log will falsely claim delivery that never happened.
  console.log(`[email:no-provider-configured] would have sent to=${job.recipientEmail} subject="${job.subject}"`);
  return { ok: false, skipped: true };
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
    lastError: result.skipped ? "No email provider configured" : (result.error ?? null),
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
      lastError: result.skipped ? "No email provider configured" : (result.error ?? null),
      sentAt: result.ok ? new Date() : null,
    }).where(eq(tables.notificationJobs.id, job.id));
    if (result.ok) retried++;
  }
  return retried;
}
