/**
 * 在右侧停靠栏打开一个主对话（不离开当前页面，可以接着聊），以及按会话 id 读对话的实时标题。
 * 停靠栏只承载主对话（main-chat 桶），其余场景的对话不经这里打开。
 */

import { useShellStore } from "@/app/shellStore";
import useChatSessionStore, { MAIN_CHAT_BUCKET, bucketKeyOf } from "@/stores/useChatSessionStore";

export function openChatInDock(sessionId: string) {
  useChatSessionStore.getState().setCurrent(MAIN_CHAT_BUCKET, sessionId);
  useShellStore.getState().setAssistOpen(true);
}

/**
 * 主对话的当前标题：已打开的对话优先（自动生成的标题先到这里），其次是目录行。
 * 不在主对话目录里的返回 undefined，调用方退回自己存的标题。
 */
export function useChatTitle(): (sessionId: string) => string | undefined {
  const rows = useChatSessionStore(state => state.buckets[bucketKeyOf(MAIN_CHAT_BUCKET)]?.rows);
  const opened = useChatSessionStore(state => state.opened);
  return sessionId => opened[sessionId]?.title || rows?.find(row => row.id === sessionId)?.title;
}
