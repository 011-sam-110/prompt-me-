"use client";
// SPEC.md §6: "Either side proposes idea + slot; the other accepts/declines.
// Unlimited re-proposals." Every proposal ever made for the match renders
// here, newest first (lib/date-proposals/get-match-proposals.ts's own
// comment) — declining one never removes it or unmatches the pair, it just
// stays in the list as a declined row, and a fresh proposal can always be
// sent alongside it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProposalWithDisplay } from "@/lib/date-proposals/get-match-proposals";
import { submitAcceptDate, submitDeclineDate } from "@/lib/date-proposals/actions";
import { VenuePicker } from "./venue-picker";

// Locale pinned explicitly, not `undefined` — see
// components/calendar/calendar-slot-list.tsx's identical formatters and
// their own comment: an unpinned locale lets the server's default locale
// disagree with the browser's for the same Date, which trips a React
// hydration-mismatch error (this is where that was first observed,
// 2026-08-24, building this file).
const dateFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", month: "short", day: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" });

function formatRange(startAt: Date, endAt: Date): string {
  return `${dateFormatter.format(startAt)}, ${timeFormatter.format(startAt)}–${timeFormatter.format(endAt)}`;
}

const STATUS_LABEL: Record<ProposalWithDisplay["status"], string> = {
  pending: "Awaiting response",
  accepted: "Accepted — choosing a place",
  declined: "Declined",
};

export function ProposalList({
  proposals,
  viewerId,
  matchId,
}: {
  proposals: ProposalWithDisplay[];
  viewerId: string;
  matchId: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function respond(proposalId: string, action: "accept" | "decline") {
    setError(null);
    setBusyId(proposalId);
    const submit = action === "accept" ? submitAcceptDate : submitDeclineDate;
    submit(proposalId)
      .then(() => {
        startTransition(() => {
          router.refresh();
        });
      })
      .catch(() => {
        setError("Couldn't record your response. Please try again.");
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  if (proposals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="date-proposal-list">
        No dates proposed yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-3" data-testid="date-proposal-list">
        {proposals.map((proposal) => {
          const isProposer = proposal.proposedByUserId === viewerId;
          const busy = (busyId === proposal.id) || isPending;

          return (
            <li
              key={proposal.id}
              data-proposal-id={proposal.id}
              data-proposal-status={proposal.status}
              data-proposal-locked={proposal.locked}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{proposal.ideaText}</p>
                  <p className="text-xs text-muted-foreground">{formatRange(proposal.slotStartAt, proposal.slotEndAt)}</p>
                </div>
                <span
                  data-testid="proposal-status-badge"
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
                    proposal.locked
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : proposal.status === "declined"
                        ? "bg-muted text-muted-foreground"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                  }`}
                >
                  {proposal.locked ? "Locked" : STATUS_LABEL[proposal.status]}
                </span>
              </div>

              {proposal.status === "pending" && !isProposer && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => respond(proposal.id, "accept")}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => respond(proposal.id, "decline")}>
                    Decline
                  </Button>
                </div>
              )}
              {proposal.status === "pending" && isProposer && (
                <p className="text-xs text-muted-foreground">Waiting for your match to respond.</p>
              )}

              {proposal.status === "accepted" && !proposal.venue && (
                <div className="flex flex-col gap-2 border-t border-border pt-2">
                  <p className="text-xs text-muted-foreground">
                    Idea and time are agreed — choose a public place to meet to lock this date in.
                  </p>
                  <VenuePicker proposalId={proposal.id} />
                </div>
              )}

              {proposal.venue && (
                <p className="text-xs text-muted-foreground">
                  Meeting at <span className="font-medium text-foreground">{proposal.venue.name}</span>
                  {proposal.venue.address ? ` — ${proposal.venue.address}` : ""}
                </p>
              )}

              {proposal.locked && proposal.chatWindowId && (
                <Link
                  href={`/matches/${matchId}/chat/${proposal.chatWindowId}`}
                  data-testid="open-chat-link"
                  data-chat-window-id={proposal.chatWindowId}
                  className="self-start text-xs font-medium text-primary hover:underline"
                >
                  Open chat &rarr;
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
