// The composition point for SPEC.md §6's "accepting requires agreeing a
// public-venue meeting place." ROADMAP.md M9: "no free-text address field
// that could bypass it" — this function is the server-side half of that
// guarantee. The picker UI (components/date-proposals/venue-picker.tsx) has
// no text-address input at all, only buttons over results it just received
// from the same provider's searchVenues; but this function does not TRUST
// that the id it receives came from the picker. It re-resolves
// `venuePlaceId` through the real provider's `getPlace` and re-checks
// @prompt-me/core's isAllowedVenueType before ever persisting — so a
// venuePlaceId submitted straight to the server action
// (lib/date-proposals/actions.ts's submitSetDateVenue), skipping the picker
// component entirely, is rejected exactly the same way a residential place
// would be rejected from the picker's own search results.
import { computeChatWindowTimes, getPlacesProvider, isAllowedVenueType, isDateProposalLocked } from "@prompt-me/core";
import { createChatWindowIfNotExists, setDateProposalVenue, type AnyDb, type DateProposal } from "@prompt-me/db";
import { loadProposalForParticipant } from "./load-proposal";

export class InvalidVenueError extends Error {
  constructor(placeId: string) {
    super(`setDateVenue: placeId=${placeId} does not resolve to an allowed public-venue place`);
    this.name = "InvalidVenueError";
  }
}

/**
 * Either participant may call this once the proposal is accepted — SPEC.md
 * §6 describes "agreeing" a place as part of accepting, not as a second
 * asymmetric approval step, so there is no proposer/responder restriction
 * here the way respond.ts's accept/decline has one.
 *
 * Throws InvalidVenueError for an id that doesn't resolve to an allowed
 * public-venue place at all (including one that resolves to a REAL place
 * of a disallowed type — see @prompt-me/core's DevMockPlacesProvider's
 * DEV_MOCK_DISALLOWED_PLACE fixture for exactly this case). Throws
 * @prompt-me/db's DateProposalNotAcceptedError if the proposal itself isn't
 * `status = "accepted"` yet — a venue can never be attached ahead of
 * idea/slot acceptance.
 *
 * ENGINEERING_SPEC §11 / ROADMAP.md M11: "a chat_windows row is created
 * when a date_proposal becomes 'locked'." This is the single place a
 * proposal ever transitions into "locked" (@prompt-me/core's
 * isDateProposalLocked's own header comment names exactly this: accepted +
 * a non-null venue), so it's the single place that creates the window —
 * computeChatWindowTimes derives opens_at/closes_at from the proposal's
 * own slotStartAt, and createChatWindowIfNotExists
 * (packages/db/src/queries/chat-windows.ts) persists it idempotently: a
 * participant changing their mind about the venue after the date is
 * already locked calls this function again for the same already-locked
 * proposal, and that must not open (or reset) a second window.
 */
export async function setDateVenue(
  db: AnyDb,
  proposalId: string,
  viewerId: string,
  venuePlaceId: string,
): Promise<DateProposal> {
  await loadProposalForParticipant(db, proposalId, viewerId);

  const place = await getPlacesProvider().getPlace(venuePlaceId);
  if (!place || !isAllowedVenueType(place.types)) {
    throw new InvalidVenueError(venuePlaceId);
  }

  const updated = await setDateProposalVenue(db, proposalId, venuePlaceId);

  if (isDateProposalLocked(updated)) {
    const { opensAt, closesAt } = computeChatWindowTimes(updated.slotStartAt);
    await createChatWindowIfNotExists(db, {
      matchId: updated.matchId,
      dateProposalId: updated.id,
      opensAt,
      closesAt,
    });
  }

  return updated;
}
