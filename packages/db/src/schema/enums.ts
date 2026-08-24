// Shared pg enum types for ENGINEERING_SPEC.md §2.
//
// Two enums intentionally use different vocabularies even though they both
// describe a pass/fail outcome:
//  - `verificationResultEnum` ("pass"/"fail"/"pending") is the per-check
//    result recorded in `verification_records` (one row per liveness check
//    and one per age-estimate check — see verification.ts).
//  - `userVerificationStatusEnum` ("pending"/"passed"/"failed") is the
//    account-level gate on `users.verification_status` that ENGINEERING_SPEC
//    §3 and ROADMAP M3 literally spell as `verification_status = passed`.
// Keeping them as separate enums (rather than reusing one) matches the
// spec's own wording for each and avoids conflating "one check's result"
// with "the account's overall gate state".
import { pgEnum } from "drizzle-orm/pg-core";

/** Outcome of a single liveness or age-estimate check (verification_records). */
export const verificationResultEnum = pgEnum("verification_result", [
  "pass",
  "fail",
  "pending",
]);

/** Account-level verification gate (users.verification_status). ENGINEERING_SPEC §3. */
export const userVerificationStatusEnum = pgEnum("user_verification_status", [
  "pending",
  "passed",
  "failed",
]);

/**
 * clips.moderation_status. ENGINEERING_SPEC §12 names "pending_review" and
 * "approved" explicitly. Two more states are implied by the upload flow
 * (§4/§12) and are added here as an engineering decision, not literal spec
 * text:
 *  - "processing": the default the row is created with the instant a clip
 *    is uploaded, before the async transcription/moderation pass completes
 *    (the spec's "before moderation_status flips to approved" implies some
 *    starting state).
 *  - "rejected": the outcome once a human reviewer confirms a
 *    `moderation_flags` hit rather than clearing it (§12's "until a human
 *    clears it" implies clearing is one of at least two possible outcomes).
 */
export const moderationStatusEnum = pgEnum("moderation_status", [
  "processing",
  "pending_review",
  "approved",
  "rejected",
]);

/**
 * feed_decisions.decision. ENGINEERING_SPEC §2's purpose column literally
 * reads "Deny (recirculate) vs. match (hard-exclude)" — modeled as a
 * two-value enum so this table is a full log of feed outcomes for a
 * (viewer, profile) pair, even though the match *lifecycle* itself lives in
 * `matches` (§7). A "matched" row is written here for audit/history
 * alongside the `matches` row; the candidate-query hard-exclude in §6 reads
 * `matches`, not this column.
 */
export const feedDecisionEnum = pgEnum("feed_decision", ["denied", "matched"]);

/** matches.status. ENGINEERING_SPEC §2/§7. */
export const matchStatusEnum = pgEnum("match_status", ["active", "blocked"]);

/** calendar_slots.status — "Busy/available calendar" (ENGINEERING_SPEC §2). */
export const calendarSlotStatusEnum = pgEnum("calendar_slot_status", [
  "busy",
  "available",
]);

/**
 * date_proposals.idea_source — whether the proposed idea came from the
 * generator's cache (`date_ideas_generated`) or was typed in free-hand
 * (SPEC.md §6: "the two algorithm-generated ideas... or a custom idea
 * either person writes in").
 */
export const ideaSourceEnum = pgEnum("idea_source", ["generated", "custom"]);

/**
 * date_proposals.status — SPEC.md §6: "Either side proposes idea + slot,
 * the other accepts/declines. Unlimited re-proposals."
 */
export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "declined",
]);

/**
 * reports.status. Not given explicit values anywhere in SPEC.md/
 * ENGINEERING_SPEC.md (§2's Open questions lists "in-app reporting flow"
 * as still open) — this three-state lifecycle is an engineering default
 * to unblock the schema, matching the same shape ROADMAP flags for other
 * undecided policy details.
 */
export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "under_review",
  "resolved",
]);

/**
 * moderation_flags.action_taken — the outcome of the human review step
 * ROADMAP M12 requires ("a flagged clip stays invisible until a human
 * review action clears it"). Null until `reviewed = true`.
 */
export const moderationActionEnum = pgEnum("moderation_action", [
  "cleared",
  "removed",
]);
