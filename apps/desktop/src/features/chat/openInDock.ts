/**
 * 在右侧停靠栏打开一个主对话（不离开当前页面，可以接着聊），以及按会话 id 读对话的实时标题。
 * 停靠栏只承载主对话（main-chat 桶），其余场景的对话不经这里打开。
 */

import { create } from "zustand";
import { useShellStore } from "@/app/shellStore";
import { getChatDatabase } from "@/services/chatDatabase";
import useChatSessionStore, { MAIN_CHAT_BUCKET, bucketKeyOf } from "@/stores/useChatSessionStore";
import type { ChatSessionRow } from "@/types/chat-session";

interface DockEntry {
  sessionId: string;
  entry: string;
  database: string;
  requestId: number;
}

/** 停靠栏待定位的一轮：一次性导航意图，定位（或提示不在当前分支）后清掉 */
export const useDockEntryStore = create<{ intent: DockEntry | null }>(() => ({ intent: null }));
let nextRequestId = 0;
const mainBucketKey = bucketKeyOf(MAIN_CHAT_BUCKET);
const titlesByRows = new WeakMap<readonly ChatSessionRow[], Map<string, string>>();

function findDirectoryTitle(rows: readonly ChatSessionRow[] | undefined, sessionId: string) {
  if (!rows) return undefined;
  let titles = titlesByRows.get(rows);
  if (!titles) {
    titles = new Map(rows.map(row => [row.id, row.title]));
    titlesByRows.set(rows, titles);
  }
  return titles.get(sessionId);
}

export function openChatInDock(sessionId: string, options: { entry?: string } = {}) {
  useDockEntryStore.setState({
    intent: options.entry
      ? { sessionId, entry: options.entry, database: getChatDatabase(), requestId: ++nextRequestId }
      : null,
  });
  useChatSessionStore.getState().setCurrent(MAIN_CHAT_BUCKET, sessionId);
  useShellStore.getState().setAssistOpen(true);
}

export function clearDockEntry(intent: DockEntry) {
  if (useDockEntryStore.getState().intent === intent) useDockEntryStore.setState({ intent: null });
}

/**
 * 主对话的当前标题：已打开的对话优先（自动生成的标题先到这里），其次是目录行。
 * 不在主对话目录里的返回 undefined，调用方退回自己存的标题。
 */
export function useChatTitle(sessionId: string | undefined): string | undefined {
  return useChatSessionStore(state =>
    sessionId
      ? state.opened[sessionId]?.title ||
        findDirectoryTitle(state.buckets[mainBucketKey]?.rows, sessionId)
      : undefined
  );
}
