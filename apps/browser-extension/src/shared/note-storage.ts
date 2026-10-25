/**
 * 页面笔记在 chrome.storage.local 里的键：草稿（编辑器原生节点，按页面）、待追加队列、已保存的卡片。
 * 内容脚本只往待追加队列里放 Markdown（摘录、AI 回答），由笔记页转换成编辑器节点后并入草稿，
 * 草稿只有笔记页一个写入方，不会互相覆盖。
 */
import { pageKeyOf } from "./messages";

export const noteDraftKey = (url: string) => `note:${pageKeyOf(url)}`;
export const notePendingKey = (url: string) => `note-pending:${pageKeyOf(url)}`;
export const noteSavedKey = (url: string) => `notes-saved:${pageKeyOf(url)}`;
/** 后台把连接状态写在这里，笔记页据此决定能否保存、取主题 */
export const STATUS_KEY = "companion.status";

export interface SavedNote {
  cardId: number;
  savedAt: number;
  preview: string;
}

/** 笔记页发给后台的消息（扩展页面没有内容脚本的端口，走 runtime.sendMessage） */
export type NotePageMessage = { kind: "note-rpc"; method: string; params: unknown };
export type NotePageReply = { ok: true; result: unknown } | { ok: false; error: string };
