import { NextRequest, NextResponse } from "next/server";
import { db, tables } from "@/db";
import { registrationSubmitSchema } from "@/lib/registration-schema";
import { sendTemplatedEmail } from "@/lib/server/notify";
import bcrypt from "bcryptjs";

/**
 * Public endpoint. Simple in-memory fixed-window rate limit (per IP) plus a
 * honeypot field. Serverless instances each hold their own window, which is
 * acceptable abuse damping for a club-sized form; the review queue is the
 * real gate since nothing becomes a family without coach approval.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions from this connection. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: real users never fill this hidden field.
  if (typeof body === "object" && body !== null && (body as Record<string, unknown>)["website"]) {
    return NextResponse.json({ ok: true });
  }

  const parsed = registrationSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Some fields need attention.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const club = await db.query.clubs.findFirst();
  if (!club) return NextResponse.json({ ok: false, error: "Club is not configured yet." }, { status: 500 });

  // Split the password out: it's hashed immediately and stored in its own
  // column, never as part of the stored payload snapshot.
  const { password, ...payload } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const [submission] = await db.insert(tables.registrationSubmissions).values({
    clubId: club.id,
    payload,
    passwordHash,
    status: "pending",
  }).returning({ id: tables.registrationSubmissions.id });

  // Waiver acknowledgment is captured at submission time (pre-approval),
  // tied to the submission via the audit trail and payload snapshot.
  await db.insert(tables.waivers).values({
    waiverType: "registration",
    version: "v1",
    acceptedName: payload.waiver.signatureName,
    acceptedAt: new Date(),
    sourceIp: ip,
  });

  const primary = payload.guardians[0];
  const diverNames = payload.divers.map((d) => d.preferredName || d.legalName).join(", ");
  await sendTemplatedEmail({
    clubId: club.id,
    eventType: "registration_received",
    recipientEmail: primary.email,
    fields: { guardian_name: primary.name, diver_names: diverNames },
    idempotencyKey: `registration_received:${submission.id}`,
  });

  return NextResponse.json({ ok: true, submissionId: submission.id });
}
