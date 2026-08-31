ALTER TABLE "club_memberships" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_rsvps" ADD COLUMN "responded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_rsvps" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_series" ADD COLUMN "requires_signup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_series" ADD COLUMN "min_signup_count" integer;--> statement-breakpoint
ALTER TABLE "practice_series" ADD COLUMN "signup_cutoff_hours" integer;--> statement-breakpoint
ALTER TABLE "practices" ADD COLUMN "requires_signup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "practices" ADD COLUMN "min_signup_count" integer;--> statement-breakpoint
ALTER TABLE "practices" ADD COLUMN "signup_cutoff_hours" integer;--> statement-breakpoint
ALTER TABLE "practices" ADD COLUMN "auto_canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_rsvps" ADD CONSTRAINT "practice_rsvps_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;