// verification_records — ENGINEERING_SPEC.md §2, §3.
//
// Deliberately holds no selfie/frame data whatsoever — only the boolean-ish
// enum result and a confidence score. ENGINEERING_SPEC §3: "the raw
// selfie/video frame used for the check is processed in-memory and
// discarded — only the boolean result + confidence score is persisted."
import { real, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { verificationResultEnum } from "./enums";
import { users } from "./users";

export const verificationRecords = pgTable("verification_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  livenessResult: verificationResultEnum("liveness_result").notNull(),
  ageEstimateResult: verificationResultEnum("age_estimate_result").notNull(),
  // 0.0-1.0 confidence score from the verification provider (Didit).
  confidence: real("confidence").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
