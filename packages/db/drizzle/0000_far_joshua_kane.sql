CREATE TYPE "public"."calendar_slot_status" AS ENUM('busy', 'available');--> statement-breakpoint
CREATE TYPE "public"."feed_decision" AS ENUM('denied', 'matched');--> statement-breakpoint
CREATE TYPE "public"."idea_source" AS ENUM('generated', 'custom');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."moderation_action" AS ENUM('cleared', 'removed');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('processing', 'pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'under_review', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."user_verification_status" AS ENUM('pending', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."verification_result" AS ENUM('pass', 'fail', 'pending');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" varchar(255) NOT NULL,
	"verification_status" "user_verification_status" DEFAULT 'pending' NOT NULL,
	"geohash5" varchar(5),
	"radius_km" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_radius_km_positive" CHECK ("users"."radius_km" > 0)
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"liveness_result" "verification_result" NOT NULL,
	"age_estimate_result" "verification_result" NOT NULL,
	"confidence" real NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" integer NOT NULL,
	"text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_tier_range" CHECK ("prompts"."tier" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" integer NOT NULL,
	"duration_seconds" real NOT NULL,
	"storage_url" text NOT NULL,
	"transcript" text,
	"prompt_id" uuid,
	"custom_prompt_text" text,
	"moderation_status" "moderation_status" DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clips_tier_range" CHECK ("clips"."tier" BETWEEN 1 AND 4),
	CONSTRAINT "clips_duration_positive" CHECK ("clips"."duration_seconds" > 0),
	CONSTRAINT "clips_prompt_source_xor" CHECK (("clips"."prompt_id" IS NOT NULL) <> ("clips"."custom_prompt_text" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "clip_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_id" uuid NOT NULL,
	"profile_user_id" uuid NOT NULL,
	"clip_id" uuid NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_id" uuid NOT NULL,
	"profile_user_id" uuid NOT NULL,
	"decision" "feed_decision" NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eligible_again_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"status" "match_status" DEFAULT 'active' NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_no_self_match" CHECK ("matches"."user_a_id" <> "matches"."user_b_id")
);
--> statement-breakpoint
CREATE TABLE "rewatch_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"viewer_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "calendar_slot_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_slots_end_after_start" CHECK ("calendar_slots"."end_at" > "calendar_slots"."start_at")
);
--> statement-breakpoint
CREATE TABLE "date_ideas_generated" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"idea_text" text NOT NULL,
	"rationale" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"proposed_by_user_id" uuid NOT NULL,
	"idea_source" "idea_source" NOT NULL,
	"idea_text" text NOT NULL,
	"generated_idea_id" uuid,
	"slot_start_at" timestamp with time zone NOT NULL,
	"slot_end_at" timestamp with time zone NOT NULL,
	"venue_place_id" text,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_proposals_slot_end_after_start" CHECK ("date_proposals"."slot_end_at" > "date_proposals"."slot_start_at"),
	CONSTRAINT "date_proposals_generated_idea_xor" CHECK (("date_proposals"."idea_source" = 'generated' AND "date_proposals"."generated_idea_id" IS NOT NULL) OR ("date_proposals"."idea_source" = 'custom' AND "date_proposals"."generated_idea_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "chat_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"date_proposal_id" uuid NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_windows_closes_after_opens" CHECK ("chat_windows"."closes_at" > "chat_windows"."opens_at")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_window_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clip_id" uuid,
	"chat_message_id" uuid,
	"flag_type" text NOT NULL,
	"confidence" real NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"action_taken" "moderation_action",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_flags_target_xor" CHECK (("moderation_flags"."clip_id" IS NOT NULL) <> ("moderation_flags"."chat_message_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_views" ADD CONSTRAINT "clip_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_views" ADD CONSTRAINT "clip_views_profile_user_id_users_id_fk" FOREIGN KEY ("profile_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_views" ADD CONSTRAINT "clip_views_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_decisions" ADD CONSTRAINT "feed_decisions_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_decisions" ADD CONSTRAINT "feed_decisions_profile_user_id_users_id_fk" FOREIGN KEY ("profile_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewatch_sessions" ADD CONSTRAINT "rewatch_sessions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewatch_sessions" ADD CONSTRAINT "rewatch_sessions_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_slots" ADD CONSTRAINT "calendar_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_ideas_generated" ADD CONSTRAINT "date_ideas_generated_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_proposals" ADD CONSTRAINT "date_proposals_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_proposals" ADD CONSTRAINT "date_proposals_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_proposals" ADD CONSTRAINT "date_proposals_generated_idea_id_date_ideas_generated_id_fk" FOREIGN KEY ("generated_idea_id") REFERENCES "public"."date_ideas_generated"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_windows" ADD CONSTRAINT "chat_windows_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_windows" ADD CONSTRAINT "chat_windows_date_proposal_id_date_proposals_id_fk" FOREIGN KEY ("date_proposal_id") REFERENCES "public"."date_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_window_id_chat_windows_id_fk" FOREIGN KEY ("chat_window_id") REFERENCES "public"."chat_windows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clips_user_tier_idx" ON "clips" USING btree ("user_id","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "clip_views_viewer_clip_idx" ON "clip_views" USING btree ("viewer_id","clip_id");--> statement-breakpoint
CREATE INDEX "feed_decisions_viewer_profile_idx" ON "feed_decisions" USING btree ("viewer_id","profile_user_id");--> statement-breakpoint
CREATE INDEX "feed_decisions_eligible_again_idx" ON "feed_decisions" USING btree ("eligible_again_at");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_user_pair_idx" ON "matches" USING btree ("user_a_id","user_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_windows_date_proposal_idx" ON "chat_windows" USING btree ("date_proposal_id");