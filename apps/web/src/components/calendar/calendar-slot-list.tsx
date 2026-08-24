// Renders one person's busy/available calendar as a plain chronological
// list — SPEC.md §6: "Each person keeps a busy/available calendar." Shared
// by both the signed-in viewer's own (editable) calendar and their match
// partner's (read-only) calendar on the same page, so the two always render
// identically apart from whether a delete control appears.
"use client";
import type { CalendarSlot } from "@prompt-me/db";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function formatRange(startAt: Date, endAt: Date): string {
  return `${dateFormatter.format(startAt)}, ${timeFormatter.format(startAt)}–${timeFormatter.format(endAt)}`;
}

export function CalendarSlotList({
  slots,
  onDelete,
  emptyLabel,
  testId,
}: {
  slots: CalendarSlot[];
  /** Omit to render read-only (the match partner's calendar). */
  onDelete?: (slotId: string) => void;
  emptyLabel: string;
  /** Playwright evidence hook (CLAUDE.md's UI-evidence requirement) — never read by app logic. */
  testId?: string;
}) {
  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={testId}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5" data-testid={testId}>
      {slots.map((slot) => (
        <li
          key={slot.id}
          data-slot-id={slot.id}
          data-slot-status={slot.status}
          className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full ${
                slot.status === "available" ? "bg-emerald-500" : "bg-zinc-400"
              }`}
            />
            <span>{formatRange(slot.startAt, slot.endAt)}</span>
            <span className="text-xs text-muted-foreground">{slot.status}</span>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(slot.id)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              aria-label={`Remove ${slot.status} slot ${formatRange(slot.startAt, slot.endAt)}`}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
