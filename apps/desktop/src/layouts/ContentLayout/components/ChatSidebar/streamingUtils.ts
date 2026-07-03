import type { ChatMessage } from "@/types";

export const withStreamingUpdateTime = <
  T extends Pick<ChatMessage, "updateTime">,
>(
  chat: T,
  now = Date.now(),
): T => ({
  ...chat,
  updateTime: Math.max(chat.updateTime || 0, now),
});
