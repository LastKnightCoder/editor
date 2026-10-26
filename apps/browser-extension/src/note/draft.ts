/**
 * 笔记页的草稿读写：草稿只接受编辑器原生节点，不转换旧格式。
 * 待追加队列里的 Markdown 片段在这里转换后接到草稿末尾，并清空队列。
 */
import type { Descendant } from "slate";
import { noteDraftKey, notePendingKey } from "../shared/note-storage";
import type { KeyValueStore } from "../background/connection";

export const EMPTY_NOTE: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as unknown as Descendant,
];

const nodeText = (node: unknown): string => {
  const value = node as { text?: unknown; children?: unknown[] };
  if (typeof value.text === "string") return value.text;
  return Array.isArray(value.children) ? value.children.map(nodeText).join("") : "";
};

/** 全是空段落即为空（分割线、代码块等没有文字也是内容） */
export const isEmptyNote = (nodes: readonly Descendant[]) =>
  nodes.every(node => (node as { type?: string }).type === "paragraph" && !nodeText(node).trim());

/** 已保存卡片列表里的预览：第一段有文字的内容 */
export const notePreview = (nodes: readonly Descendant[]) =>
  nodes
    .map(nodeText)
    .find(text => text.trim())
    ?.trim()
    .slice(0, 80) ?? "";

export async function loadDraft(storage: KeyValueStore, url: string): Promise<Descendant[]> {
  const stored = await storage.get<unknown>(noteDraftKey(url));
  if (stored !== undefined && stored !== null && !Array.isArray(stored))
    throw new Error("笔记草稿格式不受支持，原始数据未改动");
  return Array.isArray(stored) && stored.length ? (stored as Descendant[]) : EMPTY_NOTE;
}

/** 取出待追加的片段并清空队列；没有返回 null */
export async function takePending(
  storage: KeyValueStore,
  url: string,
  toNodes: (markdown: string) => Descendant[]
): Promise<Descendant[] | null> {
  const pending = await storage.get<string[]>(notePendingKey(url));
  if (!pending?.length) return null;
  await storage.remove(notePendingKey(url));
  return pending.flatMap(markdown => toNodes(markdown));
}
