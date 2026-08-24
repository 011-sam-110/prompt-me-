"use client";
// ENGINEERING_SPEC.md §10 / ROADMAP.md M10: the generated pair renders
// alongside components/date-proposals/propose-form.tsx's custom-idea path
// ("generated ideas are selectable alongside custom ones") — each idea gets
// its own small propose sub-form rather than funneling through the custom
// form's free-text field, so a proposer can't accidentally edit the
// generated wording without switching to a genuinely custom proposal.
// Mirrors propose-form.tsx's own submit/error/busy shape per idea.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DateIdeaGenerated } from "@prompt-me/db";
import { Button } from "@/components/ui/button";
import { submitProposeGeneratedDate, submitRegenerateIdeas } from "@/lib/date-ideas/actions";

function IdeaProposeForm({ matchId, ideaId }: { matchId: string; ideaId: string }) {
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!startAt || !endAt) {
      setError("Pick both a start and an end time.");
      return;
    }
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (!(end.getTime() > start.getTime())) {
      setError("End time must be after the start time.");
      return;
    }

    setIsSaving(true);
    submitProposeGeneratedDate(matchId, ideaId, start.toISOString(), end.toISOString())
      .then(() => {
        setStartAt("");
        setEndAt("");
        startTransition(() => {
          router.refresh();
        });
      })
      .catch(() => {
        setError("Couldn't send that proposal. Please try again.");
      })
      .finally(() => {
        setIsSaving(false);
      });
  }

  const busy = isSaving || isPending;

  return (
    <form onSubmit={submit} data-testid="generated-idea-propose-form" className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Start
          <input
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            required
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          End
          <input
            type="datetime-local"
            value={endAt}
            onChange={(event) => setEndAt(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            required
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="sm" disabled={busy} className="self-start">
        {busy ? "Sending..." : "Propose this idea"}
      </Button>
    </form>
  );
}

export function GeneratedIdeasPanel({ matchId, ideas }: { matchId: string; ideas: DateIdeaGenerated[] }) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function regenerate() {
    setError(null);
    setIsRegenerating(true);
    submitRegenerateIdeas(matchId)
      .then(() => {
        startTransition(() => {
          router.refresh();
        });
      })
      .catch(() => {
        setError("Couldn't generate new ideas. Please try again.");
      })
      .finally(() => {
        setIsRegenerating(false);
      });
  }

  const busy = isRegenerating || isPending;

  return (
    <div className="flex flex-col gap-3" data-testid="generated-ideas-panel">
      {ideas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No generated ideas yet.</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="generated-ideas-list">
          {ideas.map((idea) => (
            <li
              key={idea.id}
              data-idea-id={idea.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{idea.ideaText}</p>
                <p className="text-xs text-muted-foreground">{idea.rationale}</p>
              </div>
              <IdeaProposeForm matchId={matchId} ideaId={idea.id} />
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={regenerate}
        className="self-start"
        data-testid="suggest-new-ideas-button"
      >
        {busy ? "Suggesting..." : "Suggest new ideas"}
      </Button>
    </div>
  );
}
