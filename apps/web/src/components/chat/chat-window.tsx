"use client";
// ENGINEERING_SPEC.md §11 / ROADMAP.md M11's realtime half: "Messages send
// over Pusher for realtime delivery." Owns everything that changes without
// a page reload — a page in app/matches/[matchId]/chat/[chatWindowId] does
// the server-side load (history + window times) and hands them here as
// props.
//
// Transport is chosen at connect-time, not by asking the server which
// provider it's using: if NEXT_PUBLIC_PUSHER_KEY/_CLUSTER are set (Next
// inlines NEXT_PUBLIC_* at build time, even inside this transpiled
// @prompt-me/core-adjacent app code — next.config.ts's transpilePackages),
// this subscribes with the real `pusher-js` client SDK, imported
// dynamically so it's never pulled into the bundle for a dev-mock build at
// all. Otherwise it falls back to an EventSource against
// api/chat/subscribe/[chatWindowId]/route.ts, the SSE stream standing in
// for a long-lived Pusher socket over @prompt-me/core's in-memory dev-mock
// bus. Both paths publish/receive under the exact same channel/event names
// (@prompt-me/core/chat-windows's chatWindowChannelName/CHAT_MESSAGE_EVENT
// — the one client-safe subpath this file needs from core, see that
// module's own header comment for why it isn't the whole realtime barrel).
//
// Imports from "@prompt-me/core/chat-windows" rather than the root
// barrel — same reason components/location/radius-control.tsx imports
// "@prompt-me/core/location" instead of "@prompt-me/core": the root barrel
// also pulls in adapter modules (here, ../realtime's Pusher REST provider,
// which uses node:crypto) that have no place in a client bundle.
import { useEffect, useRef, useState } from "react";
import { CHAT_MESSAGE_EVENT, chatWindowChannelName, evaluateChatSendAccess } from "@prompt-me/core/chat-windows";
import { Button } from "@/components/ui/button";

export interface ChatMessageDisplay {
  id: string;
  senderId: string;
  body: string;
  /** ISO string — crosses the server/client boundary as one, same
   * convention lib/date-proposals/actions.ts's own comment documents for
   * proposal slot times. */
  sentAt: string;
}

interface RealtimeChatMessagePayload {
  message: ChatMessageDisplay;
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" });

/** How often the open/closed countdown re-evaluates against the real
 * clock — frequent enough that "opens in Nm" counts down visibly and the
 * composer unlocks itself right around opens_at without a page reload,
 * without re-rendering on every tick. */
const CLOCK_TICK_MS = 15_000;

export function ChatWindow({
  chatWindowId,
  opensAt,
  closesAt,
  viewerId,
  initialMessages,
}: {
  chatWindowId: string;
  /** ISO strings — see ChatMessageDisplay's own comment on the same
   * convention. */
  opensAt: string;
  closesAt: string;
  viewerId: string;
  initialMessages: ChatMessageDisplay[];
}) {
  const [messages, setMessages] = useState<ChatMessageDisplay[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Dedupes a message the sender's own POST response already appended
  // against the same message arriving again via the realtime subscription
  // (both parties share one channel, so the sender is also a subscriber).
  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  function addMessage(message: ChatMessageDisplay) {
    if (seenIds.current.has(message.id)) return;
    seenIds.current.add(message.id);
    setMessages((prev) => [...prev, message]);
  }

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function connect() {
      const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
      const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

      if (pusherKey && pusherCluster) {
        const { default: Pusher } = await import("pusher-js");
        if (cancelled) return;
        const client = new Pusher(pusherKey, { cluster: pusherCluster });
        const channelName = chatWindowChannelName(chatWindowId);
        const channel = client.subscribe(channelName);
        channel.bind(CHAT_MESSAGE_EVENT, (payload: RealtimeChatMessagePayload) => addMessage(payload.message));
        cleanup = () => {
          channel.unbind(CHAT_MESSAGE_EVENT);
          client.unsubscribe(channelName);
          client.disconnect();
        };
      } else {
        const source = new EventSource(`/api/chat/subscribe/${chatWindowId}`);
        source.addEventListener(CHAT_MESSAGE_EVENT, (event: MessageEvent<string>) => {
          const payload = JSON.parse(event.data) as RealtimeChatMessagePayload;
          addMessage(payload.message);
        });
        cleanup = () => source.close();
      }
    }

    void connect();
    return () => {
      cancelled = true;
      cleanup?.();
    };
    // chatWindowId is the only prop this effect actually depends on — a
    // fresh chat_windows row (a newly locked date, ROADMAP.md M11's third
    // acceptance bullet) always mounts a new page at a new URL, so this
    // never needs to re-subscribe under a changing opensAt/closesAt.
  }, [chatWindowId]);

  const decision = evaluateChatSendAccess({ opensAt: new Date(opensAt), closesAt: new Date(closesAt) }, now);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!draft.trim()) return;

    setIsSending(true);
    fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatWindowId, body: draft }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`send failed: ${response.status}`);
        }
        const { message } = (await response.json()) as { message: ChatMessageDisplay };
        addMessage(message);
        setDraft("");
      })
      .catch(() => {
        setError("Couldn't send that message. Please try again.");
      })
      .finally(() => {
        setIsSending(false);
      });
  }

  const canSend = decision.status === "allowed" && !isSending;

  return (
    <div
      data-testid="chat-window"
      data-chat-window-id={chatWindowId}
      data-chat-window-status={decision.status}
      className="flex flex-col gap-3"
    >
      <ul data-testid="chat-message-list" className="flex flex-col gap-2">
        {messages.length === 0 && <p className="text-xs text-muted-foreground">No messages yet — say hello.</p>}
        {messages.map((message) => {
          const isSelf = message.senderId === viewerId;
          return (
            <li
              key={message.id}
              data-message-id={message.id}
              data-message-sender={isSelf ? "self" : "other"}
              className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm ${
                isSelf ? "self-end border-transparent bg-primary text-primary-foreground" : "self-start border-border bg-muted"
              }`}
            >
              <p>{message.body}</p>
              <span className={`text-[0.65rem] ${isSelf ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {timeFormatter.format(new Date(message.sentAt))}
              </span>
            </li>
          );
        })}
      </ul>

      {decision.status === "not_yet_open" && (
        <p data-testid="chat-status-message" className="text-xs text-muted-foreground">
          This chat opens {Math.max(1, Math.ceil(decision.msUntilOpen / 60_000))} min before your date.
        </p>
      )}
      {decision.status === "closed" && (
        <p data-testid="chat-status-message" className="text-xs text-muted-foreground">
          This chat window has closed.
        </p>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!canSend}
          aria-label="Message"
          placeholder={decision.status === "allowed" ? "Say something..." : "This chat isn't open right now"}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-50"
        />
        <Button type="submit" size="sm" disabled={!canSend || draft.trim().length === 0}>
          {isSending ? "Sending..." : "Send"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
