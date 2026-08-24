import { describe, expect, it } from "vitest";
import { CHAT_MESSAGE_EVENT, chatWindowChannelName } from "./channel";

describe("chatWindowChannelName", () => {
  it("derives a channel name from a chat_windows id", () => {
    expect(chatWindowChannelName("abc-123")).toBe("chat-window-abc-123");
  });

  it("is stable — the same id always produces the same channel name", () => {
    expect(chatWindowChannelName("same-id")).toBe(chatWindowChannelName("same-id"));
  });

  it("two different ids never collide onto the same channel name", () => {
    expect(chatWindowChannelName("window-a")).not.toBe(chatWindowChannelName("window-b"));
  });
});

describe("CHAT_MESSAGE_EVENT", () => {
  it("is a stable, non-empty event name", () => {
    expect(CHAT_MESSAGE_EVENT).toBe("chat-message");
  });
});
