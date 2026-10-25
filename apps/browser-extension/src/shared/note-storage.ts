/**
 * 页面笔记在 chrome.storage.local 里的键：草稿（编辑器原生节点，按页面）、待追加队列、已保存的卡片、页面标题与时间。
 * 内容脚本只往待追加队列里放 Markdown（摘录、AI 回答），由笔记页转换成编辑器节点后并入草稿，
 * 草稿只有笔记页一个写入方，不会互相覆盖。
 */
import { pageKeyOf } from "./messages";

export const noteDraftKey = (url: string) => `note:${pageKeyOf(url)}`;
export const notePendingKey = (url: string) => `note-pending:${pageKeyOf(url)}`;
export const noteSavedKey = (url: string) => `notes-saved:${pageKeyOf(url)}`;
/** 笔记页写草稿或存卡片时顺带记下的页面标题与时间（伴读库的笔记汇总用） */
export const noteMetaKey = (url: string) => `note-meta:${pageKeyOf(url)}`;
/** 后台把连接状态写在这里，笔记页据此决定能否保存、取主题 */
export const STATUS_KEY = "companion.status";

export interface NoteMeta {
  title: string;
  updatedAt: number;
}

export interface SavedNote {
  cardId: number;
  savedAt: number;
  preview: string;
}
