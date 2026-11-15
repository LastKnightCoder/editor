/**
 * 聊天引用的链接形态：`tau://chat/<sessionId>?entry=<entryId>`。
 * 链接只带定位，不带标题；粘贴后由节点渲染时按会话实时标题显示。
 */

import type { ChatRefPayload } from "./types";

const PREFIX = "tau://chat/";

export function chatRefUrl(ref: Pick<ChatRefPayload, "sessionId" | "entryId">): string {
  const base = PREFIX + encodeURIComponent(ref.sessionId);
  return ref.entryId ? `${base}?entry=${encodeURIComponent(ref.entryId)}` : base;
}

/** 只认整段就是一条聊天引用链接的文本（前后空白除外） */
export function parseChatRefUrl(
  value: string
): Pick<ChatRefPayload, "sessionId" | "entryId"> | null {
  const text = value.trim();
  if (!text.startsWith(PREFIX) || /\s/.test(text)) return null;
  try {
    const url = new URL(text);
    const sessionId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (url.hostname !== "chat" || !sessionId || sessionId.includes("/")) return null;
    const entryId = url.searchParams.get("entry") || undefined;
    return { sessionId, ...(entryId ? { entryId } : {}) };
  } catch {
    return null;
  }
}

export const chatRefLabel = (ref: Pick<ChatRefPayload, "title" | "turn">) =>
  `${ref.title || "无标题对话"}${ref.turn ? ` · 第 ${ref.turn} 轮` : ""}`;

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 复制引用链接：纯文本是链接（粘回正文即成引用），富文本是带标题的链接（贴到外部应用可读） */
export async function copyChatRefLink(ref: ChatRefPayload): Promise<void> {
  const url = chatRefUrl(ref);
  const html = `<a href="${escapeHtml(url)}">${escapeHtml(chatRefLabel(ref))}</a>`;
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([url], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(url);
}
