// ROADMAP.md M4: "Prompt bank seeded (placeholder 3×4 prompts is fine —
// real copy is a separate content task)." SPEC.md §2: "The full curated
// prompt bank (3 x 4 tiers...) is a content-authoring task — not specified
// further here." Placeholder text is literally "Tier N prompt A/B/C" per
// that task's instruction — a human writes the real bank later; nothing
// here invents marketing copy.
import { and, eq } from "drizzle-orm";
import { prompts, type Prompt } from "../schema/prompts";
import type { AnyDb } from "../types";

type PlaceholderTier = 1 | 2 | 3 | 4;

export const PLACEHOLDER_PROMPT_TEXTS: Readonly<Record<PlaceholderTier, readonly [string, string, string]>> = {
  1: ["Tier 1 prompt A", "Tier 1 prompt B", "Tier 1 prompt C"],
  2: ["Tier 2 prompt A", "Tier 2 prompt B", "Tier 2 prompt C"],
  3: ["Tier 3 prompt A", "Tier 3 prompt B", "Tier 3 prompt C"],
  4: ["Tier 4 prompt A", "Tier 4 prompt B", "Tier 4 prompt C"],
};

/**
 * Idempotent and concurrency-safe, same shape as `ensureUserForClerkId`
 * (queries/users.ts): the `prompts_tier_text_idx` UNIQUE index (schema/
 * prompts.ts) + `onConflictDoNothing` means calling this repeatedly — every
 * dev-DB bootstrap (dev-client.ts), every request that resolves a
 * `promptId` before an upload (apps/web's lib/clips/upload.ts) — never
 * inserts a duplicate, so there's no separate one-off "run this once"
 * script to remember to run.
 */
const PLACEHOLDER_TIERS: readonly PlaceholderTier[] = [1, 2, 3, 4];

export async function ensurePromptsSeeded(db: AnyDb): Promise<void> {
  const rows = PLACEHOLDER_TIERS.flatMap((tier) =>
    PLACEHOLDER_PROMPT_TEXTS[tier].map((text) => ({ tier, text })),
  );
  await db.insert(prompts).values(rows).onConflictDoNothing({ target: [prompts.tier, prompts.text] });
}

export async function getActivePromptsForTier(db: AnyDb, tier: number): Promise<Prompt[]> {
  return db
    .select()
    .from(prompts)
    .where(and(eq(prompts.tier, tier), eq(prompts.isActive, true)));
}

export async function getPromptById(db: AnyDb, id: string): Promise<Prompt | undefined> {
  const [row] = await db.select().from(prompts).where(eq(prompts.id, id));
  return row;
}
