/**
 * AI 对话页纯函数：页面参数解析、侧栏子项取数（D-047）。
 */

import type { ChatSessionRow } from "@/types/chat-session";

/** 侧栏「最近」露出条数（置顶全量露出） */
export const NAV_RECENT_LIMIT = 3;

/**
 * 页面参数 id（字符串）→ 会话 id（pi 会话 id）；缺省或非法为 null（新对话空态）。
 * 旧版本的数字 id 已无对应会话，按非法处理。
 */
export function parseChatId(id: unknown): string | null {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,}$/.test(id) || /^\d+$/.test(id)) return null;
  return id;
}

const isPinned = (chat: ChatSessionRow) => chat.orderNum != null;

export interface NavSessions {
  pinned: ChatSessionRow[];
  recent: ChatSessionRow[];
  /** 「全部会话」计数：未归档的主干会话（分支随主干，不单独计） */
  total: number;
}

/**
 * 侧栏子项：置顶（按 orderNum，与会话库同序）+ 最近更新的会话 N 条。
 * 当前会话不在其中（较早的会话）时补进「最近」，保证选中项总是可见。
 */
export function navSessions(chats: ChatSessionRow[], currentId: string | null): NavSessions {
  const roots = chats.filter(chat => !chat.archived);
  const pinned = roots.filter(isPinned).sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0));
  const recent = roots
    .filter(chat => !isPinned(chat))
    .sort((a, b) => b.updateTime - a.updateTime)
    .slice(0, NAV_RECENT_LIMIT);

  const shown = new Set([...pinned, ...recent].map(chat => chat.id));
  const current = currentId !== null ? chats.find(chat => chat.id === currentId) : undefined;
  if (current && !shown.has(current.id)) recent.unshift(current);

  return { pinned, recent, total: roots.length };
}
