/* Seed data for Napoleon Diving Club. Idempotent: safe to re-run. */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import * as t from "./schema";

const connectionString = process.env.DATABASE_URL ?? "postgres://ndc:ndc_dev@localhost:5432/ndc_dev";
const client = postgres(connectionString, { max: 1, ssl: connectionString.includes("localhost") ? false : "require" });
const db = drizzle(client, { schema: t });

const EFFECTIVE = "2026-01-01";

async function main() {
  // Club --------------------------------------------------------------------
  let club = await db.query.clubs.findFirst({ where: eq(t.clubs.name, "Napoleon Diving Club") });
  if (!club) {
    [club] = await db.insert(t.clubs).values({
      name: "Napoleon Diving Club",
      timezone: "America/New_York",
      invoicePrefix: "NDC",
      invoiceTerms: "Due upon receipt. Please confirm payment terms with NDC before launch.",
      manualPaymentTracking: true,
    }).returning();
    console.log("Created club");
  }
  const clubId = club.id;

  // Owner/admin -------------------------------------------------------------
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "mike@napoleondiving.example").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "change-me-ndc";
  let admin = await db.query.users.findFirst({ where: eq(t.users.email, adminEmail) });
  if (!admin) {
    [admin] = await db.insert(t.users).values({
      email: adminEmail, name: "Mike Retcher",
      passwordHash: await bcrypt.hash(adminPassword, 10),
    }).returning();
    await db.insert(t.clubMemberships).values({ clubId, userId: admin.id, role: "owner_admin" });
    console.log(`Created owner/admin ${adminEmail} (password: ${adminPassword === "change-me-ndc" ? "change-me-ndc — CHANGE THIS" : "from env"})`);
  }

  // Facilities --------------------------------------------------------------
  for (const f of [
    { name: "Bowling Green State University", address: "Bowling Green, OH" },
    { name: "Napoleon High School", address: "Napoleon, OH" },
  ]) {
    const exists = await db.query.facilities.findFirst({ where: and(eq(t.facilities.clubId, clubId), eq(t.facilities.name, f.name)) });
    if (!exists) await db.insert(t.facilities).values({ clubId, ...f });
  }

  // Groups ------------------------------------------------------------------
  const groupDefs = [
    { name: "Lesson", slug: "lesson", colorToken: "sky", sortOrder: 1 },
    { name: "Beginner / Orange", slug: "beginner-orange", colorToken: "orange", sortOrder: 2 },
    { name: "Intermediate / Brown", slug: "intermediate-brown", colorToken: "brown", sortOrder: 3 },
    { name: "Elite / Navy", slug: "elite-navy", colorToken: "navy", sortOrder: 4 },
    { name: "High School Only", slug: "high-school", colorToken: "slate", sortOrder: 5 },
  ];
  const groupIds: Record<string, string> = {};
  for (const g of groupDefs) {
    let row = await db.query.groups.findFirst({ where: and(eq(t.groups.clubId, clubId), eq(t.groups.slug, g.slug)) });
    if (!row) [row] = await db.insert(t.groups).values({ clubId, ...g }).returning();
    groupIds[g.slug] = row.id;
  }

  // Billing plans (confirm before launch) -----------------------------------
  const planDefs: Array<{
    name: string; planType: "flat_monthly" | "per_practice" | "seasonal_installment" | "custom";
    groupSlug?: string; amountCents?: number; installmentMonths?: number[]; installmentTotalCents?: number;
  }> = [
    { name: "Lesson Program — Monthly", planType: "flat_monthly", groupSlug: "lesson", amountCents: 7000 },
    { name: "Beginner / Orange — Monthly", planType: "flat_monthly", groupSlug: "beginner-orange", amountCents: 11000 },
    { name: "Intermediate / Brown — Monthly", planType: "flat_monthly", groupSlug: "intermediate-brown", amountCents: 14500 },
    { name: "Elite / Navy — Monthly", planType: "flat_monthly", groupSlug: "elite-navy", amountCents: 20000 },
    { name: "High School Only — Seasonal", planType: "seasonal_installment", groupSlug: "high-school", installmentMonths: [11, 12, 1, 2], installmentTotalCents: 55000 },
    { name: "Per Practice", planType: "per_practice" },
    { name: "Custom Arrangement", planType: "custom" },
  ];
  for (const p of planDefs) {
    const exists = await db.query.billingPlans.findFirst({ where: and(eq(t.billingPlans.clubId, clubId), eq(t.billingPlans.name, p.name)) });
    if (!exists) {
      await db.insert(t.billingPlans).values({
        clubId, name: p.name, planType: p.planType,
        groupId: p.groupSlug ? groupIds[p.groupSlug] : null,
        amountCents: p.amountCents ?? null,
        installmentMonths: p.installmentMonths ?? null,
        installmentTotalCents: p.installmentTotalCents ?? null,
        confirmBeforeLaunch: true,
      });
    }
  }

  // Per-practice rate schedules (confirm before launch) ---------------------
  const rateDefs: Array<{ groupSlug: string; category: "weekday" | "sunday"; amountCents: number }> = [
    { groupSlug: "lesson", category: "weekday", amountCents: 1500 },
    { groupSlug: "lesson", category: "sunday", amountCents: 1800 },
    { groupSlug: "beginner-orange", category: "weekday", amountCents: 1500 },
    { groupSlug: "beginner-orange", category: "sunday", amountCents: 1800 },
    { groupSlug: "intermediate-brown", category: "weekday", amountCents: 2000 },
    { groupSlug: "intermediate-brown", category: "sunday", amountCents: 2500 },
    { groupSlug: "elite-navy", category: "weekday", amountCents: 2000 },
    { groupSlug: "elite-navy", category: "sunday", amountCents: 2500 },
    { groupSlug: "high-school", category: "weekday", amountCents: 2000 },
    { groupSlug: "high-school", category: "sunday", amountCents: 2500 },
  ];
  for (const r of rateDefs) {
    const gid = groupIds[r.groupSlug];
    const exists = await db.query.rateSchedules.findFirst({
      where: and(
        eq(t.rateSchedules.clubId, clubId), eq(t.rateSchedules.groupId, gid),
        eq(t.rateSchedules.category, r.category), eq(t.rateSchedules.effectiveStart, EFFECTIVE),
      ),
    });
    if (!exists) {
      await db.insert(t.rateSchedules).values({
        clubId, groupId: gid, category: r.category, amountCents: r.amountCents,
        effectiveStart: EFFECTIVE, confirmBeforeLaunch: true,
      });
    }
  }

  // Eligibility mode: warn-only at launch ------------------------------------
  const elig = await db.query.eligibilityRules.findFirst({ where: eq(t.eligibilityRules.clubId, clubId) });
  if (!elig) await db.insert(t.eligibilityRules).values({ clubId, mode: "warn" });

  // Notification templates ---------------------------------------------------
  const templates: Array<{ eventType: string; subject: string; body: string }> = [
    {
      eventType: "registration_received",
      subject: "We received your Napoleon Diving Club registration",
      body: "Hi {{guardian_name}},\n\nThanks for registering {{diver_names}} with Napoleon Diving Club. A coach will review your submission and follow up soon.\n\nIf anything changes in the meantime, just reply to this email.\n\n— Napoleon Diving Club",
    },
    {
      eventType: "registration_approved",
      subject: "Welcome to Napoleon Diving Club!",
      body: "Hi {{guardian_name}},\n\nGreat news — {{diver_names}} {{is_are}} approved and ready to dive with us.\n\nGroup placement: {{group_summary}}\nBilling plan: {{plan_summary}}\n\nSee you on the pool deck!\n\n— Napoleon Diving Club",
    },
    {
      eventType: "registration_followup",
      subject: "Your Napoleon Diving Club registration — one more thing",
      body: "Hi {{guardian_name}},\n\nWe're reviewing your registration for {{diver_names}} and need a little more information:\n\n{{followup_notes}}\n\nJust reply to this email and we'll take it from there.\n\n— Napoleon Diving Club",
    },
    {
      eventType: "membership_missing",
      subject: "Action needed: {{organization}} membership for {{diver_name}}",
      body: "Hi {{guardian_name}},\n\nOur records show {{diver_name}} still needs a current {{organization}} membership ({{detail}}).\n\nRegistration instructions: {{guide_url}}\n\nOnce complete, send us the membership number and we'll mark it verified.\n\n— Napoleon Diving Club",
    },
    {
      eventType: "practice_changed",
      subject: "Practice update: {{practice_title}} on {{practice_date}}",
      body: "Hi {{guardian_name}},\n\nA practice on your diver's calendar has changed:\n\n{{practice_title}}\n{{practice_date}}, {{practice_time}}\nLocation: {{facility}}\n\n{{change_summary}}\n\n— Napoleon Diving Club",
    },
    {
      eventType: "practice_canceled",
      subject: "Practice canceled: {{practice_title}} on {{practice_date}}",
      body: "Hi {{guardian_name}},\n\n{{practice_title}} on {{practice_date}} has been canceled.\n\n{{change_summary}}\n\nNo charges will apply for this practice.\n\n— Napoleon Diving Club",
    },
    {
      eventType: "invoice_issued",
      subject: "Napoleon Diving Club invoice {{invoice_number}} — {{cycle_label}}",
      body: "Hi {{guardian_name}},\n\nYour Napoleon Diving Club invoice for {{cycle_label}} is ready.\n\nInvoice: {{invoice_number}}\nTotal due: {{total}}\nDue date: {{due_date}}\n\n{{invoice_summary}}\n\n{{payment_instructions}}\n\nQuestions? Just reply to this email.\n\n— Napoleon Diving Club",
    },
    {
      eventType: "invoice_delivery_failed",
      subject: "[NDC admin] Invoice email failed for {{family_name}}",
      body: "Invoice {{invoice_number}} for {{family_name}} could not be emailed to {{recipient}}.\n\nError: {{error}}\n\nPlease resend from the billing screen or contact the family directly.",
    },
  ];
  for (const tpl of templates) {
    const exists = await db.query.notificationTemplates.findFirst({
      where: and(eq(t.notificationTemplates.clubId, clubId), eq(t.notificationTemplates.eventType, tpl.eventType)),
    });
    if (!exists) await db.insert(t.notificationTemplates).values({ clubId, ...tpl });
  }

  // External membership guides ----------------------------------------------
  const guides = [
    {
      organization: "aau" as const,
      title: "AAU Youth Athlete Membership",
      clubCode: "CONFIRM-CLUB-CODE",
      bodyMarkdown: [
        "Napoleon Diving Club recommends the **Extended Coverage Membership (AB)**. Extended Coverage is intended to extend coverage to qualifying participation in events hosted by non-AAU sports entities; applicable AAU conditions still control.",
        "",
        "**Current fees (verify on the official site — fees can change):**",
        "- Regular Youth Athlete Membership: $22",
        "- Extended Coverage Membership (AB): $24",
        "- Membership year: September 1 through August 31",
        "",
        "**Steps:**",
        "1. Create or sign in to your AAU account.",
        "2. Choose a Youth Athlete membership.",
        "3. Select **Diving** as the sport.",
        "4. Choose **Extended Coverage (AB)**.",
        "5. Enter the NDC club code shown above.",
        "6. Pay online.",
        "7. Send or upload the membership card to the club.",
      ].join("\n"),
      links: [
        { label: "AAU membership overview", url: "https://www.aausports.org/membership/" },
        { label: "AAU membership fees", url: "https://www.aausports.org/membership-fees/" },
        { label: "AAU Extended Coverage Program", url: "https://www.aausports.org/extended-coverage-program-ab/" },
      ],
    },
    {
      organization: "usa_diving" as const,
      title: "USA Diving Athlete Membership",
      clubCode: null,
      bodyMarkdown: [
        "Your coach will tell you which USA Diving athlete membership type your diver needs. USA Diving memberships expire on **December 31** each year.",
        "",
        "**Current athlete options (verify on the official site — fees can change):**",
        "- Introductory Athlete: $22",
        "- Athlete: $40",
        "- Competition Athlete: $200",
        "",
        "Requirements and costs can vary by age and level. Athletes classified as AQUA Age 18+ have additional background-screening and SafeSport requirements.",
        "",
        "**Steps:**",
        "1. Create or sign in to your USA Diving membership account.",
        "2. Choose the athlete membership type your coach instructed.",
        "3. Complete any age-related requirements.",
        "4. Pay online.",
        "5. Enter or upload the membership number for the club.",
      ].join("\n"),
      links: [
        { label: "USA Diving membership", url: "https://www.usadiving.org/membership" },
        { label: "Membership FAQ", url: "https://www.usadiving.org/membership/faqs-about-membership" },
        { label: "Athlete membership types", url: "https://www.usadiving.org/membership/types-of-membership/athlete-membership" },
      ],
    },
  ];
  for (const g of guides) {
    const exists = await db.query.externalGuides.findFirst({
      where: and(eq(t.externalGuides.clubId, clubId), eq(t.externalGuides.organization, g.organization)),
    });
    if (!exists) {
      await db.insert(t.externalGuides).values({
        clubId, organization: g.organization, title: g.title,
        bodyMarkdown: g.bodyMarkdown, links: g.links, clubCode: g.clubCode,
        lastVerifiedAt: "2026-07-19", verifiedBy: "Build plan (spec) — re-verify before launch",
      });
    }
  }

  console.log("Seed complete.");
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
