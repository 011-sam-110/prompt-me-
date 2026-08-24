"use client";
// The editable half of the calendar page: the signed-in viewer's own
// busy/available calendar (SPEC.md §6). Add-slot form + list, wired to the
// lib/calendar/actions.ts server actions — mirrors
// components/location/radius-control.tsx's optimistic-refresh shape: call
// the action, then router.refresh() to re-pull the server component's data
// rather than hand-rolling client-side cache state.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CalendarSlot } from "@prompt-me/db";
import { Button } from "@/components/ui/button";
import { submitAddCalendarSlot, submitRemoveCalendarSlot } from "@/lib/calendar/actions";
import { CalendarSlotList } from "./calendar-slot-list";

type SlotStatus = CalendarSlot["status"];

/** `datetime-local`'s value has no timezone; interpreted in the browser's own local time, same as the value it round-trips from. */
function toDate(datetimeLocalValue: string): Date {
  return new Date(datetimeLocalValue);
}

export function OwnCalendarEditor({ initialSlots }: { initialSlots: CalendarSlot[] }) {
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [status, setStatus] = useState<SlotStatus>("busy");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!startAt || !endAt) {
      setError("Pick both a start and an end time.");
      return;
    }
    const start = toDate(startAt);
    const end = toDate(endAt);
    if (!(end.getTime() > start.getTime())) {
      setError("End time must be after the start time.");
      return;
    }

    setIsSaving(true);
    submitAddCalendarSlot(start.toISOString(), end.toISOString(), status)
      .then(() => {
        setStartAt("");
        setEndAt("");
        startTransition(() => {
          router.refresh();
        });
      })
      .catch(() => {
        setError("Couldn't save that slot — it may overlap one you've already added.");
      })
      .finally(() => {
        setIsSaving(false);
      });
  }

  function handleDelete(slotId: string) {
    setError(null);
    submitRemoveCalendarSlot(slotId)
      .then(() => {
        startTransition(() => {
          router.refresh();
        });
      })
      .catch(() => {
        setError("Couldn't remove that slot. Please try again.");
      });
  }

  const busy = isSaving || isPending;

  return (
    <div className="flex w-full flex-col gap-3">
      <CalendarSlotList
        slots={initialSlots}
        onDelete={handleDelete}
        emptyLabel="You haven't added any times yet."
        testId="own-calendar-slots"
      />

      <form onSubmit={submitAdd} className="flex flex-col gap-2 rounded-lg border border-border p-3">
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

        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Status</legend>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="status"
              value="busy"
              checked={status === "busy"}
              onChange={() => setStatus("busy")}
            />
            Busy
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="status"
              value="available"
              checked={status === "available"}
              onChange={() => setStatus("available")}
            />
            Available
          </label>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy} className="self-start">
          {busy ? "Saving..." : "Add to calendar"}
        </Button>
      </form>
    </div>
  );
}
