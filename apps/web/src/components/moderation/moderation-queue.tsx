"use client";
// ROADMAP.md M12: "a minimal internal human-review queue UI lists
// moderation_flags awaiting action" + "actions to approve or take down the
// flagged content." Mirrors components/date-proposals/proposal-list.tsx's
// shape (useTransition + router.refresh() after a server action, a busy
// id so only the acted-on row disables its own buttons, an error banner)
// applied to a second, unrelated list of actionable rows.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitApproveModerationFlag, submitTakeDownModerationFlag } from "@/lib/moderation/actions";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export interface ModerationClipFlagDisplay {
  flagId: string;
  flagType: string;
  confidence: number;
  createdAt: Date;
  clipId: string;
  clipTier: number;
  /** Null before Whisper transcription finishes — see clips.transcript's
   * own schema comment; a moderation flag can only exist once a transcript
   * (or sampled frame) has actually been scored, so in practice this is
   * always populated for a clip that reaches this list, but the type
   * itself is honest about the column being nullable. */
  transcript: string | null;
}

export interface ModerationChatFlagDisplay {
  flagId: string;
  flagType: string;
  confidence: number;
  createdAt: Date;
  chatMessageId: string;
  body: string;
  sentAt: Date;
  /** Set if an earlier, separate flag on the same message was already
   * taken down — this flag is still unreviewed, but the message it points
   * at is already gone. */
  alreadyRemoved: boolean;
}

function ConfidenceBadge({ confidence, flagType }: { confidence: number; flagType: string }) {
  return (
    <span
      data-testid="moderation-flag-badge"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs whitespace-nowrap text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
    >
      {flagType} &middot; {Math.round(confidence * 100)}%
    </span>
  );
}

export function ModerationQueue({
  clipFlags,
  chatFlags,
}: {
  clipFlags: ModerationClipFlagDisplay[];
  chatFlags: ModerationChatFlagDisplay[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function review(flagId: string, action: "approve" | "takedown") {
    setError(null);
    setBusyId(flagId);
    const submit = action === "approve" ? submitApproveModerationFlag : submitTakeDownModerationFlag;
    submit(flagId)
      .then(() => {
        startTransition(() => {
          router.refresh();
        });
      })
      .catch(() => {
        setError("Couldn't record that review action. Please try again.");
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  const empty = clipFlags.length === 0 && chatFlags.length === 0;

  if (empty) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="moderation-queue-empty">
        Nothing awaiting review — every flagged item has been actioned.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="moderation-queue">
      {clipFlags.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Flagged clips ({clipFlags.length})</h2>
          <ul className="flex flex-col gap-3" data-testid="moderation-clip-flag-list">
            {clipFlags.map((row) => {
              const busy = busyId === row.flagId || isPending;
              return (
                <li
                  key={row.flagId}
                  data-testid="moderation-clip-flag"
                  data-flag-id={row.flagId}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Clip &middot; tier {row.clipTier}</p>
                      <p className="text-xs text-muted-foreground">Flagged {dateTimeFormatter.format(row.createdAt)}</p>
                    </div>
                    <ConfidenceBadge confidence={row.confidence} flagType={row.flagType} />
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    {row.transcript ? `"${row.transcript}"` : "(no transcript yet)"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/clips/${row.clipId}`}
                      data-testid="moderation-clip-watch-link"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Watch clip &rarr;
                    </Link>
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => review(row.flagId, "approve")}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => review(row.flagId, "takedown")}
                      >
                        Take down
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {chatFlags.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Flagged chat messages ({chatFlags.length})</h2>
          <ul className="flex flex-col gap-3" data-testid="moderation-chat-flag-list">
            {chatFlags.map((row) => {
              const busy = busyId === row.flagId || isPending;
              return (
                <li
                  key={row.flagId}
                  data-testid="moderation-chat-flag"
                  data-flag-id={row.flagId}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Chat message</p>
                      <p className="text-xs text-muted-foreground">Sent {dateTimeFormatter.format(row.sentAt)}</p>
                    </div>
                    <ConfidenceBadge confidence={row.confidence} flagType={row.flagType} />
                  </div>
                  <p className="text-xs text-muted-foreground italic">&quot;{row.body}&quot;</p>
                  {row.alreadyRemoved ? (
                    <p className="text-xs font-medium text-destructive">
                      Already taken down via a separate flag on this message.
                    </p>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" disabled={busy} onClick={() => review(row.flagId, "approve")}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => review(row.flagId, "takedown")}
                      >
                        Take down
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
