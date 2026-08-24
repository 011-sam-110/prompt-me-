// Barrel for @prompt-me/core's chat-window-lifecycle domain logic
// (ENGINEERING_SPEC.md §11, ROADMAP.md M11). Pure and dependency-free, same
// as ../rewatch — no DB handle, only an explicit `now`.
export {
  CHAT_WINDOW_OPENS_BEFORE_MINUTES,
  CHAT_WINDOW_CLOSES_AFTER_HOURS,
  computeChatWindowTimes,
  evaluateChatSendAccess,
  type ChatWindowTimes,
  type ChatSendAccessDecision,
} from "./window";
export { CHAT_MESSAGE_EVENT, chatWindowChannelName } from "./channel";
