// ROADMAP.md M9: "A date is 'locked' only once idea + slot + venue are all
// accepted together." packages/db/src/schema/date-proposals.ts's own header
// comment already spells out why this is a derived/application-level state
// rather than a DB enum value: a `date_proposals` row always carries an
// idea (`ideaText`, non-nullable) and a slot (`slotStartAt`/`slotEndAt`,
// non-nullable) from the moment it's created — SPEC.md §6's "either side
// proposes idea + slot" means those two legs of the three-way idea/slot/venue
// requirement are already present on every row that exists at all. The only
// leg that can be missing is the venue: `venuePlaceId` stays null until
// apps/web's lib/date-proposals/set-venue.ts's setDateProposalVenue is
// called, which only ever succeeds on a row whose `status` is already
// "accepted" (packages/db/src/queries/date-proposals.ts's
// setDateProposalVenue).
//
// This function is the single place "locked" is decided app-wide.
// `status === "accepted"` alone is NOT sufficient — see locking.test.ts's
// partial-acceptance case: SPEC.md §6's "accepting requires agreeing a
// public-venue meeting place... a date isn't locked until both an idea/slot
// AND a place are settled" describes exactly this in-between, reachable
// state (idea/slot accepted, venue not yet chosen), and it must read as
// NOT locked.
export interface DateProposalLockInput {
  status: "pending" | "accepted" | "declined";
  venuePlaceId: string | null;
}

export function isDateProposalLocked(proposal: DateProposalLockInput): boolean {
  return proposal.status === "accepted" && proposal.venuePlaceId !== null;
}
