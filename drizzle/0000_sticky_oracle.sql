CREATE TYPE "public"."attendance_status" AS ENUM('unmarked', 'present', 'absent', 'excused', 'trial');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle_status" AS ENUM('open', 'in_review', 'closed');--> statement-breakpoint
CREATE TYPE "public"."billing_plan_type" AS ENUM('flat_monthly', 'per_practice', 'seasonal_installment', 'custom');--> statement-breakpoint
CREATE TYPE "public"."charge_source" AS ENUM('attendance', 'flat_monthly', 'seasonal_installment', 'manual', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('draft', 'reviewed', 'invoiced', 'waived', 'voided');--> statement-breakpoint
CREATE TYPE "public"."discount_kind" AS ENUM('fixed', 'percent');--> statement-breakpoint
CREATE TYPE "public"."diver_status" AS ENUM('active', 'inactive', 'prospective');--> statement-breakpoint
CREATE TYPE "public"."eligibility_mode" AS ENUM('off', 'warn', 'enforce');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'ready_for_review', 'approved', 'issued', 'partially_paid', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."membership_org" AS ENUM('aau', 'usa_diving');--> statement-breakpoint
CREATE TYPE "public"."membership_verification" AS ENUM('missing', 'pending', 'verified', 'expired');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."practice_category" AS ENUM('weekday', 'sunday', 'clinic', 'non_billable');--> statement-breakpoint
CREATE TYPE "public"."practice_status" AS ENUM('scheduled', 'changed', 'canceled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner_admin', 'coach', 'family');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('attending', 'not_attending', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'needs_followup', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "attendance_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_id" uuid NOT NULL,
	"prior_status" "attendance_status",
	"new_status" "attendance_status" NOT NULL,
	"prior_billable" boolean,
	"new_billable" boolean NOT NULL,
	"reason" text,
	"changed_by_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"diver_id" uuid NOT NULL,
	"status" "attendance_status" DEFAULT 'unmarked' NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"billable_override_reason" text,
	"notes" text,
	"recorded_by_user_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "billing_cycle_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plan_type" "billing_plan_type" NOT NULL,
	"group_id" uuid,
	"amount_cents" integer,
	"installment_months" jsonb,
	"installment_total_cents" integer,
	"notes" text,
	"confirm_before_launch" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"diver_id" uuid,
	"source_type" charge_source NOT NULL,
	"source_id" text,
	"service_date" date NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" charge_status DEFAULT 'draft' NOT NULL,
	"rate_snapshot" jsonb,
	"waive_reason" text,
	"created_by_user_id" uuid,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'coach' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"invoice_terms" text,
	"invoice_prefix" text DEFAULT 'NDC' NOT NULL,
	"next_invoice_number" integer DEFAULT 1 NOT NULL,
	"manual_payment_tracking" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"remaining_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"effective_date" date NOT NULL,
	"voided" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts_and_aid" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid,
	"diver_id" uuid,
	"kind" "discount_kind" NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer,
	"percent" integer,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"approved_by_user_id" uuid,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diver_medical" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diver_id" uuid NOT NULL,
	"allergies" text,
	"medical_considerations" text,
	"emergency_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diver_medical_diver_id_unique" UNIQUE("diver_id")
);
--> statement-breakpoint
CREATE TABLE "diver_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diver_id" uuid NOT NULL,
	"organization" "membership_org" NOT NULL,
	"membership_number" text,
	"membership_type" text,
	"effective_date" date,
	"expiration_date" date,
	"verification" "membership_verification" DEFAULT 'missing' NOT NULL,
	"document_file_id" uuid,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diver_plan_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diver_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"override_amount_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"preferred_name" text,
	"birth_date" date,
	"school" text,
	"grade" text,
	"experience" text,
	"activities_notes" text,
	"status" "diver_status" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"primary_group_id" uuid,
	"free_trial_allowance" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"mode" "eligibility_mode" DEFAULT 'warn' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"organization" "membership_org" NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"club_code" text,
	"last_verified_at" date,
	"verified_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"entry_notes" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"billing_name" text NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"zip" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color_token" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text,
	"email" text,
	"phone" text,
	"preferred_contact" text,
	"is_emergency_contact" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"diver_id" uuid,
	"source_charge_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"rate_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"number" text,
	"issue_date" date,
	"due_date" date,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"credit_applied_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issued_by_user_id" uuid,
	"issued_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"idempotency_key" text,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"invoice_id" uuid,
	"amount_cents" integer NOT NULL,
	"method" text,
	"reference" text,
	"received_date" date NOT NULL,
	"recorded_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"diver_id" uuid NOT NULL,
	"status" "rsvp_status" NOT NULL,
	"waitlist_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"title" text NOT NULL,
	"facility_id" uuid,
	"weekdays" jsonb NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"category" "practice_category" DEFAULT 'weekday' NOT NULL,
	"eligible_group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_coach_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"series_id" uuid,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"practice_date" date NOT NULL,
	"facility_id" uuid,
	"category" "practice_category" DEFAULT 'weekday' NOT NULL,
	"eligible_group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capacity" integer,
	"public_description" text,
	"internal_notes" text,
	"status" "practice_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"group_id" uuid,
	"category" "practice_category" NOT NULL,
	"amount_cents" integer NOT NULL,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"priority" integer DEFAULT 0 NOT NULL,
	"confirm_before_launch" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"reviewer_user_id" uuid,
	"resulting_family_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid,
	"diver_id" uuid,
	"waiver_type" text NOT NULL,
	"version" text DEFAULT 'v1' NOT NULL,
	"accepted_name" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"source_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_change_log" ADD CONSTRAINT "attendance_change_log_attendance_id_attendance_records_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_change_log" ADD CONSTRAINT "attendance_change_log_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_plans" ADD CONSTRAINT "billing_plans_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_plans" ADD CONSTRAINT "billing_plans_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts_and_aid" ADD CONSTRAINT "discounts_and_aid_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts_and_aid" ADD CONSTRAINT "discounts_and_aid_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts_and_aid" ADD CONSTRAINT "discounts_and_aid_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diver_medical" ADD CONSTRAINT "diver_medical_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diver_memberships" ADD CONSTRAINT "diver_memberships_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diver_plan_assignments" ADD CONSTRAINT "diver_plan_assignments_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diver_plan_assignments" ADD CONSTRAINT "diver_plan_assignments_plan_id_billing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divers" ADD CONSTRAINT "divers_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divers" ADD CONSTRAINT "divers_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divers" ADD CONSTRAINT "divers_primary_group_id_groups_id_fk" FOREIGN KEY ("primary_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_rules" ADD CONSTRAINT "eligibility_rules_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_guides" ADD CONSTRAINT "external_guides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_source_charge_id_charges_id_fk" FOREIGN KEY ("source_charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_coaches" ADD CONSTRAINT "practice_coaches_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_coaches" ADD CONSTRAINT "practice_coaches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_rsvps" ADD CONSTRAINT "practice_rsvps_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_rsvps" ADD CONSTRAINT "practice_rsvps_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_series" ADD CONSTRAINT "practice_series_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_series" ADD CONSTRAINT "practice_series_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_series_id_practice_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."practice_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_schedules" ADD CONSTRAINT "rate_schedules_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_schedules" ADD CONSTRAINT "rate_schedules_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_submissions" ADD CONSTRAINT "registration_submissions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_submissions" ADD CONSTRAINT "registration_submissions_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_submissions" ADD CONSTRAINT "registration_submissions_resulting_family_id_families_id_fk" FOREIGN KEY ("resulting_family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_diver_id_divers_id_fk" FOREIGN KEY ("diver_id") REFERENCES "public"."divers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_unique" ON "attendance_records" USING btree ("practice_id","diver_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_unique" ON "billing_cycles" USING btree ("club_id","year","month");--> statement-breakpoint
CREATE INDEX "plans_club_idx" ON "billing_plans" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_source_idx" ON "charges" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "charges_family_idx" ON "charges" USING btree ("family_id","service_date");--> statement-breakpoint
CREATE INDEX "charges_status_idx" ON "charges" USING btree ("club_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "club_membership_unique" ON "club_memberships" USING btree ("club_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diver_membership_org_idx" ON "diver_memberships" USING btree ("diver_id","organization");--> statement-breakpoint
CREATE INDEX "plan_assignments_diver_idx" ON "diver_plan_assignments" USING btree ("diver_id","effective_start");--> statement-breakpoint
CREATE INDEX "divers_family_idx" ON "divers" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "divers_group_idx" ON "divers" USING btree ("primary_group_id");--> statement-breakpoint
CREATE INDEX "families_club_idx" ON "families" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_slug_idx" ON "groups" USING btree ("club_id","slug");--> statement-breakpoint
CREATE INDEX "guardians_family_idx" ON "guardians" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "guardians_email_idx" ON "guardians" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_cycle_idx" ON "invoices" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "invoices_family_idx" ON "invoices" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_idx" ON "invoices" USING btree ("club_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_idem_idx" ON "notification_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_status_idx" ON "notification_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "template_event_idx" ON "notification_templates" USING btree ("club_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_coach_unique" ON "practice_coaches" USING btree ("practice_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rsvp_unique" ON "practice_rsvps" USING btree ("practice_id","diver_id");--> statement-breakpoint
CREATE INDEX "practices_date_idx" ON "practices" USING btree ("club_id","practice_date");--> statement-breakpoint
CREATE INDEX "practices_series_idx" ON "practices" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "rates_lookup_idx" ON "rate_schedules" USING btree ("club_id","group_id","category","effective_start");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "registration_submissions" USING btree ("club_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");