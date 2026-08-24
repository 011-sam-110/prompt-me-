// Barrel for @prompt-me/core's calendar domain logic (ENGINEERING_SPEC.md
// §2/§9, ROADMAP.md M9). Pure and dependency-free, same as ../location —
// safe to import from a client component via the narrower
// "@prompt-me/core/calendar" subpath (package.json) if a future slice needs
// client-side range validation before submitting.
export {
  isValidSlotRange,
  slotsOverlap,
  findOverlappingSlot,
  type SlotRange,
} from "./slots";
