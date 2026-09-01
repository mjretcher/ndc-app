import {
  pgTable, pgEnum, text, integer, boolean, timestamp, date, uuid, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const roleEnum = pgEnum("role", ["owner_admin", "coach", "family"]); // family reserved, unused in MVP
export const submissionStatusEnum = pgEnum("submission_status", [
  "pending", "needs_followup", "approved", "rejected",
]);
export const diverStatusEnum = pgEnum("diver_status", ["active", "inactive", "prospective"]);
export const membershipOrgEnum = pgEnum("membership_org", ["aau", "usa_diving"]);
export const membershipVerificationEnum = pgEnum("membership_verification", [
  "missing", "pending", "verified", "expired",
]);
export const billingPlanTypeEnum = pgEnum("billing_plan_type", [
  "flat_monthly", "per_practice", "seasonal_installment", "custom",
]);
export const practiceCategoryEnum = pgEnum("practice_category", [
  "weekday", "saturday", "sunday", "clinic", "non_billable",
]);
export const practiceStatusEnum = pgEnum("practice_status", [
  "scheduled", "changed", "canceled", "completed",
]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "unmarked", "present", "absent", "excused", "trial",
]);
export const chargeStatusEnum = pgEnum("charge_status", [
  "draft", "reviewed", "invoiced", "waived", "voided",
]);
export const chargeSourceEnum = pgEnum("charge_source", [
  "attendance", "flat_monthly", "seasonal_installment", "manual", "adjustment",
]);
export const billingCycleStatusEnum = pgEnum("billing_cycle_status", [
  "open", "in_review", "closed",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft", "ready_for_review", "approved", "issued", "partially_paid", "paid", "void",
]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "queued", "sent", "failed", "skipped",
]);
export const eligibilityModeEnum = pgEnum("eligibility_mode", ["off", "warn", "enforce"]);
export const discountKindEnum = pgEnum("discount_kind", ["fixed", "percent"]);
export const rsvpStatusEnum = pgEnum("rsvp_status", ["attending", "not_attending", "waitlisted"]); // reserved for post-MVP

// ---------------------------------------------------------------------------
// Club & access
// ---------------------------------------------------------------------------
export const clubs = pgTable("clubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  invoiceTerms: text("invoice_terms"),
  invoicePrefix: text("invoice_prefix").notNull().default("NDC"),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  manualPaymentTracking: boolean("manual_payment_tracking").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const clubMemberships = pgTable("club_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: roleEnum("role").notNull().default("coach"),
  // Set only when role = "family": scopes a guardian's login to one family.
  familyId: uuid("family_id").references(() => families.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("club_membership_unique").on(t.clubId, t.userId)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_time_idx").on(t.createdAt)]);

// ---------------------------------------------------------------------------
// Families & divers
// ---------------------------------------------------------------------------
export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  billingName: text("billing_name").notNull(),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("families_club_idx").on(t.clubId)]);

export const guardians = pgTable("guardians", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id),
  name: text("name").notNull(),
  relationship: text("relationship"),
  email: text("email"),
  phone: text("phone"),
  preferredContact: text("preferred_contact"),
  isEmergencyContact: boolean("is_emergency_contact").notNull().default(false),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("guardians_family_idx").on(t.familyId), index("guardians_email_idx").on(t.email)]);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  colorToken: text("color_token"), // e.g. "orange", "brown", "navy"
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("groups_slug_idx").on(t.clubId, t.slug)]);

export const divers = pgTable("divers", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  familyId: uuid("family_id").notNull().references(() => families.id),
  legalName: text("legal_name").notNull(),
  preferredName: text("preferred_name"),
  birthDate: date("birth_date"),
  school: text("school"),
  grade: text("grade"),
  experience: text("experience"),
  activitiesNotes: text("activities_notes"),
  status: diverStatusEnum("status").notNull().default("active"),
  startDate: date("start_date"),
  primaryGroupId: uuid("primary_group_id").references(() => groups.id),
  freeTrialAllowance: integer("free_trial_allowance").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("divers_family_idx").on(t.familyId), index("divers_group_idx").on(t.primaryGroupId)]);

export const diverMedical = pgTable("diver_medical", {
  id: uuid("id").primaryKey().defaultRandom(),
  diverId: uuid("diver_id").notNull().references(() => divers.id).unique(),
  allergies: text("allergies"),
  medicalConsiderations: text("medical_considerations"),
  emergencyNotes: text("emergency_notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const diverMemberships = pgTable("diver_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  diverId: uuid("diver_id").notNull().references(() => divers.id),
  organization: membershipOrgEnum("organization").notNull(),
  membershipNumber: text("membership_number"),
  membershipType: text("membership_type"),
  effectiveDate: date("effective_date"),
  expirationDate: date("expiration_date"),
  verification: membershipVerificationEnum("verification").notNull().default("missing"),
  documentFileId: uuid("document_file_id"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("diver_membership_org_idx").on(t.diverId, t.organization)]);

export const waivers = pgTable("waivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").references(() => families.id),
  diverId: uuid("diver_id").references(() => divers.id),
  waiverType: text("waiver_type").notNull(),
  version: text("version").notNull().default("v1"),
  acceptedName: text("accepted_name").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  sourceIp: text("source_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registrationSubmissions = pgTable("registration_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  payload: jsonb("payload").notNull(), // immutable snapshot of the submitted form
  // Set only if the family chose a portal password at submission time. Never
  // the raw password — a bcrypt hash, applied to their login on approval.
  passwordHash: text("password_hash"),
  status: submissionStatusEnum("status").notNull().default("pending"),
  reviewNotes: text("review_notes"),
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
  resultingFamilyId: uuid("resulting_family_id").references(() => families.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (t) => [index("submissions_status_idx").on(t.clubId, t.status)]);

// ---------------------------------------------------------------------------
// Pricing & plans
// ---------------------------------------------------------------------------
export const billingPlans = pgTable("billing_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  name: text("name").notNull(),
  planType: billingPlanTypeEnum("plan_type").notNull(),
  groupId: uuid("group_id").references(() => groups.id),
  // flat_monthly: amountCents charged monthly. seasonal_installment: totalCents split over installmentMonths.
  amountCents: integer("amount_cents"),
  installmentMonths: jsonb("installment_months"), // e.g. [11,12,1,2]
  installmentTotalCents: integer("installment_total_cents"),
  notes: text("notes"),
  confirmBeforeLaunch: boolean("confirm_before_launch").notNull().default(false),
  active: boolean("active").notNull().default(true),
}, (t) => [index("plans_club_idx").on(t.clubId)]);

export const rateSchedules = pgTable("rate_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  groupId: uuid("group_id").references(() => groups.id),
  category: practiceCategoryEnum("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  effectiveStart: date("effective_start").notNull(),
  effectiveEnd: date("effective_end"),
  priority: integer("priority").notNull().default(0),
  confirmBeforeLaunch: boolean("confirm_before_launch").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("rates_lookup_idx").on(t.clubId, t.groupId, t.category, t.effectiveStart)]);

export const diverPlanAssignments = pgTable("diver_plan_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  diverId: uuid("diver_id").notNull().references(() => divers.id),
  planId: uuid("plan_id").notNull().references(() => billingPlans.id),
  effectiveStart: date("effective_start").notNull(),
  effectiveEnd: date("effective_end"),
  overrideAmountCents: integer("override_amount_cents"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("plan_assignments_diver_idx").on(t.diverId, t.effectiveStart)]);

export const discountsAndAid = pgTable("discounts_and_aid", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").references(() => families.id),
  diverId: uuid("diver_id").references(() => divers.id),
  kind: discountKindEnum("kind").notNull(),
  label: text("label").notNull(),
  amountCents: integer("amount_cents"), // when kind=fixed
  percent: integer("percent"), // when kind=percent, whole percentage points
  effectiveStart: date("effective_start").notNull(),
  effectiveEnd: date("effective_end"),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
});

export const eligibilityRules = pgTable("eligibility_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  mode: eligibilityModeEnum("mode").notNull().default("warn"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Scheduling & attendance
// ---------------------------------------------------------------------------
export const facilities = pgTable("facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  name: text("name").notNull(),
  address: text("address"),
  entryNotes: text("entry_notes"),
  active: boolean("active").notNull().default(true),
});

export const practiceSeries = pgTable("practice_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  title: text("title").notNull(),
  facilityId: uuid("facility_id").references(() => facilities.id),
  // recurrence: weekly on selected weekdays between range dates
  weekdays: jsonb("weekdays").notNull(), // [0..6], 0=Sunday
  startTime: text("start_time").notNull(), // "17:30" club-local
  endTime: text("end_time").notNull(),
  rangeStart: date("range_start").notNull(),
  rangeEnd: date("range_end").notNull(),
  category: practiceCategoryEnum("category").notNull().default("weekday"),
  eligibleGroupIds: jsonb("eligible_group_ids").notNull().default([]),
  defaultCoachIds: jsonb("default_coach_ids").notNull().default([]),
  notes: text("notes"),
  requiresSignup: boolean("requires_signup").notNull().default(false),
  minSignupCount: integer("min_signup_count"),
  signupCutoffHours: integer("signup_cutoff_hours"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const practices = pgTable("practices", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  seriesId: uuid("series_id").references(() => practiceSeries.id),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  practiceDate: date("practice_date").notNull(), // club-local calendar date used for billing
  facilityId: uuid("facility_id").references(() => facilities.id),
  category: practiceCategoryEnum("category").notNull().default("weekday"),
  eligibleGroupIds: jsonb("eligible_group_ids").notNull().default([]),
  capacity: integer("capacity"),
  publicDescription: text("public_description"),
  internalNotes: text("internal_notes"),
  status: practiceStatusEnum("status").notNull().default("scheduled"),
  // Sign-up-required practices: families must RSVP; auto-canceled if under threshold.
  requiresSignup: boolean("requires_signup").notNull().default(false),
  minSignupCount: integer("min_signup_count"),
  signupCutoffHours: integer("signup_cutoff_hours"),
  autoCanceledAt: timestamp("auto_canceled_at", { withTimezone: true }),
  signupCheckedAt: timestamp("signup_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("practices_date_idx").on(t.clubId, t.practiceDate), index("practices_series_idx").on(t.seriesId)]);

export const practiceCoaches = pgTable("practice_coaches", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id").notNull().references(() => practices.id),
  userId: uuid("user_id").notNull().references(() => users.id),
}, (t) => [uniqueIndex("practice_coach_unique").on(t.practiceId, t.userId)]);

// Recurring weekly pattern: does this coach generally coach on this weekday?
// Absence of a row for a given weekday means "no preference set" — treated as
// available, so a coach who never opens this page is never falsely flagged.
export const coachWeeklyAvailability = pgTable("coach_weekly_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  weekday: integer("weekday").notNull(), // 0=Sun..6=Sat
  available: boolean("available").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("coach_weekly_avail_unique").on(t.userId, t.weekday)]);

// One-off overrides for a specific date — can mark unavailable on an
// otherwise-available weekday, or available on an otherwise-unavailable one.
export const coachAvailabilityExceptions = pgTable("coach_availability_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  available: boolean("available").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("coach_availability_exception_unique").on(t.userId, t.date)]);

export const attendanceRecords = pgTable("attendance_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id").notNull().references(() => practices.id),
  diverId: uuid("diver_id").notNull().references(() => divers.id),
  status: attendanceStatusEnum("status").notNull().default("unmarked"),
  billable: boolean("billable").notNull().default(true),
  billableOverrideReason: text("billable_override_reason"),
  notes: text("notes"),
  recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("attendance_unique").on(t.practiceId, t.diverId)]);

export const attendanceChangeLog = pgTable("attendance_change_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  attendanceId: uuid("attendance_id").notNull().references(() => attendanceRecords.id),
  priorStatus: attendanceStatusEnum("prior_status"),
  newStatus: attendanceStatusEnum("new_status").notNull(),
  priorBillable: boolean("prior_billable"),
  newBillable: boolean("new_billable").notNull(),
  reason: text("reason"),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

// Family self-service practice sign-up (portal). One row per diver per practice.
export const practiceRsvps = pgTable("practice_rsvps", {
  id: uuid("id").primaryKey().defaultRandom(),
  practiceId: uuid("practice_id").notNull().references(() => practices.id),
  diverId: uuid("diver_id").notNull().references(() => divers.id),
  status: rsvpStatusEnum("status").notNull(),
  waitlistOrder: integer("waitlist_order"),
  respondedByUserId: uuid("responded_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("rsvp_unique").on(t.practiceId, t.diverId)]);

// ---------------------------------------------------------------------------
// Charges, cycles, invoices
// ---------------------------------------------------------------------------
export const billingCycles = pgTable("billing_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  status: billingCycleStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cycle_unique").on(t.clubId, t.year, t.month)]);

export const charges = pgTable("charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  familyId: uuid("family_id").notNull().references(() => families.id),
  diverId: uuid("diver_id").references(() => divers.id),
  sourceType: chargeSourceEnum("source_type").notNull(),
  sourceId: text("source_id"), // attendance id / plan-assignment key etc. — idempotency anchor
  serviceDate: date("service_date").notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: chargeStatusEnum("status").notNull().default("draft"),
  needsAttention: boolean("needs_attention").notNull().default(false), // e.g. missing rate → $0 marker
  rateSnapshot: jsonb("rate_snapshot"), // frozen rate/plan detail at creation
  waiveReason: text("waive_reason"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  invoiceId: uuid("invoice_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("charges_source_idx").on(t.sourceType, t.sourceId),
  index("charges_family_idx").on(t.familyId, t.serviceDate),
  index("charges_status_idx").on(t.clubId, t.status),
]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  familyId: uuid("family_id").notNull().references(() => families.id),
  cycleId: uuid("cycle_id").notNull().references(() => billingCycles.id),
  number: text("number"), // assigned immutably at issue
  issueDate: date("issue_date"),
  dueDate: date("due_date"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  creditAppliedCents: integer("credit_applied_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  issuedByUserId: uuid("issued_by_user_id").references(() => users.id),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invoices_cycle_idx").on(t.cycleId),
  index("invoices_family_idx").on(t.familyId),
  uniqueIndex("invoices_number_idx").on(t.clubId, t.number),
]);

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  diverId: uuid("diver_id").references(() => divers.id),
  sourceChargeId: uuid("source_charge_id").references(() => charges.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  rateCents: integer("rate_cents").notNull(),
  amountCents: integer("amount_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)]);

export const credits = pgTable("credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id),
  amountCents: integer("amount_cents").notNull(),
  remainingCents: integer("remaining_cents").notNull(),
  reason: text("reason").notNull(),
  effectiveDate: date("effective_date").notNull(),
  voided: boolean("voided").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Manual payment recording (club.manualPaymentTracking gates the UI).
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  amountCents: integer("amount_cents").notNull(),
  method: text("method"), // check, cash, other
  reference: text("reference"),
  receivedDate: date("received_date").notNull(),
  recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Content & notifications
// ---------------------------------------------------------------------------
export const externalGuides = pgTable("external_guides", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  organization: membershipOrgEnum("organization").notNull(),
  title: text("title").notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  links: jsonb("links").notNull().default([]), // [{label, url}]
  clubCode: text("club_code"),
  lastVerifiedAt: date("last_verified_at"),
  verifiedBy: text("verified_by"),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  eventType: text("event_type").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(), // plain text with {{merge_fields}}
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("template_event_idx").on(t.clubId, t.eventType)]);

export const notificationJobs = pgTable("notification_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  eventType: text("event_type").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  idempotencyKey: text("idempotency_key"),
  status: notificationStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  providerId: text("provider_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => [uniqueIndex("notification_idem_idx").on(t.idempotencyKey), index("notification_status_idx").on(t.status)]);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  kind: text("kind").notNull(), // membership_card | waiver | invoice_pdf
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (query-layer convenience)
// ---------------------------------------------------------------------------
export const familiesRelations = relations(families, ({ many }) => ({
  guardians: many(guardians),
  divers: many(divers),
}));
export const guardiansRelations = relations(guardians, ({ one }) => ({
  family: one(families, { fields: [guardians.familyId], references: [families.id] }),
}));
export const diversRelations = relations(divers, ({ one, many }) => ({
  family: one(families, { fields: [divers.familyId], references: [families.id] }),
  primaryGroup: one(groups, { fields: [divers.primaryGroupId], references: [groups.id] }),
  medical: one(diverMedical, { fields: [divers.id], references: [diverMedical.diverId] }),
  memberships: many(diverMemberships),
  planAssignments: many(diverPlanAssignments),
}));
export const diverMembershipsRelations = relations(diverMemberships, ({ one }) => ({
  diver: one(divers, { fields: [diverMemberships.diverId], references: [divers.id] }),
}));
export const diverPlanAssignmentsRelations = relations(diverPlanAssignments, ({ one }) => ({
  diver: one(divers, { fields: [diverPlanAssignments.diverId], references: [divers.id] }),
  plan: one(billingPlans, { fields: [diverPlanAssignments.planId], references: [billingPlans.id] }),
}));
export const practicesRelations = relations(practices, ({ one, many }) => ({
  facility: one(facilities, { fields: [practices.facilityId], references: [facilities.id] }),
  series: one(practiceSeries, { fields: [practices.seriesId], references: [practiceSeries.id] }),
  attendance: many(attendanceRecords),
  coaches: many(practiceCoaches),
}));
export const practiceSeriesRelations = relations(practiceSeries, ({ one }) => ({
  facility: one(facilities, { fields: [practiceSeries.facilityId], references: [facilities.id] }),
}));
export const practiceCoachesRelations = relations(practiceCoaches, ({ one }) => ({
  practice: one(practices, { fields: [practiceCoaches.practiceId], references: [practices.id] }),
  user: one(users, { fields: [practiceCoaches.userId], references: [users.id] }),
}));
export const coachWeeklyAvailabilityRelations = relations(coachWeeklyAvailability, ({ one }) => ({
  user: one(users, { fields: [coachWeeklyAvailability.userId], references: [users.id] }),
}));
export const coachAvailabilityExceptionsRelations = relations(coachAvailabilityExceptions, ({ one }) => ({
  user: one(users, { fields: [coachAvailabilityExceptions.userId], references: [users.id] }),
}));
export const attendanceRelations = relations(attendanceRecords, ({ one }) => ({
  practice: one(practices, { fields: [attendanceRecords.practiceId], references: [practices.id] }),
  diver: one(divers, { fields: [attendanceRecords.diverId], references: [divers.id] }),
}));
export const chargesRelations = relations(charges, ({ one }) => ({
  family: one(families, { fields: [charges.familyId], references: [families.id] }),
  diver: one(divers, { fields: [charges.diverId], references: [divers.id] }),
}));
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  family: one(families, { fields: [invoices.familyId], references: [families.id] }),
  cycle: one(billingCycles, { fields: [invoices.cycleId], references: [billingCycles.id] }),
  lines: many(invoiceLines),
  payments: many(payments),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  family: one(families, { fields: [payments.familyId], references: [families.id] }),
}));
export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actor: one(users, { fields: [auditEvents.actorUserId], references: [users.id] }),
}));
export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
  diver: one(divers, { fields: [invoiceLines.diverId], references: [divers.id] }),
}));
export const clubMembershipsRelations = relations(clubMemberships, ({ one }) => ({
  user: one(users, { fields: [clubMemberships.userId], references: [users.id] }),
  club: one(clubs, { fields: [clubMemberships.clubId], references: [clubs.id] }),
  family: one(families, { fields: [clubMemberships.familyId], references: [families.id] }),
}));
export const practiceRsvpsRelations = relations(practiceRsvps, ({ one }) => ({
  practice: one(practices, { fields: [practiceRsvps.practiceId], references: [practices.id] }),
  diver: one(divers, { fields: [practiceRsvps.diverId], references: [divers.id] }),
}));
