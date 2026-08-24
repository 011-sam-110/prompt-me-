"use client";
// SPEC.md §6: "Either side proposes idea + slot." Custom idea text only —
// ROADMAP.md M9's scope was "custom idea text for now — M10's generated
// ideas plug in later." M10's own entry point now sits alongside this one,
// a "pick a generated idea" surface — components/date-ideas/generated-ideas-panel.tsx,
// rendered in the same page above this form.
// Mirrors components/calendar/own-calendar-editor.tsx's shape exactly:
// call the server action, then router.refresh() to re-pull the server
// component's data rather than hand-rolling client-side cache state.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitProposeDate } from "@/lib/date-proposals/actions";

export function ProposeForm({ matchId }: { matchId: string }) {
  const [ideaText, setIdeaText] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!ideaText.trim()) {
      setError("Write a date idea first.");
      return;
    }
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
    submitProposeDate(matchId, ideaText, start.toISOString(), end.toISOString())
      .then(() => {
        setIdeaText("");
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
    <form
      onSubmit={submit}
      data-testid="propose-date-form"
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Date idea
        <textarea
          value={ideaText}
          onChange={(event) => setIdeaText(event.target.value)}
          placeholder="e.g. Coffee and a walk along the seafront"
          rows={2}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          required
        />
      </label>

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

      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Sending..." : "Propose this date"}
      </Button>
    </form>
  );
}
