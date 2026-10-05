import { useEffect, useState } from "react";
import type { Descendant } from "slate";
import type { NoteMetadata } from "../utils/types";
import { STORAGE_PREFIX_CONTENT, STORAGE_PREFIX_META } from "./useNotes";

export interface NoteListItem extends NoteMetadata {
  /** 正文开头的纯文本（列表预览用） */
  preview: string;
}

const PREVIEW_LENGTH = 120;

/** 取富文本开头的纯文本，块之间以空格相连 */
export function notePreviewText(nodes: Descendant[] | undefined, limit = PREVIEW_LENGTH): string {
  let out = "";
  const visit = (node: unknown): boolean => {
    if (out.length >= limit || !node || typeof node !== "object") return out.length >= limit;
    const record = node as { text?: unknown; children?: unknown[] };
    if (typeof record.text === "string") {
      out += record.text;
      return out.length >= limit;
    }
    if (Array.isArray(record.children)) {
      for (const child of record.children) if (visit(child)) return true;
      out += " ";
    }
    return out.length >= limit;
  };
  for (const node of nodes ?? []) if (visit(node)) break;
  return out.replace(/\s+/g, " ").trim().slice(0, limit);
}

/**
 * 当前页面的笔记列表（只读：标题、时间与正文开头），本页流展示用；
 * 编辑仍走 useNotes。笔记元数据或正文变化时自动刷新。
 */
export function useNoteList(url: string | null) {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setNotes([]);
    setLoaded(false);
    if (!url) return;
    let alive = true;
    const metaKey = `${STORAGE_PREFIX_META}${url}`;

    const load = async () => {
      const metaResult = await chrome.storage.local.get(metaKey);
      const meta = (metaResult[metaKey] as NoteMetadata[] | undefined) ?? [];
      const contentKeys = meta.map(note => `${STORAGE_PREFIX_CONTENT}${note.id}`);
      const contents = contentKeys.length ? await chrome.storage.local.get(contentKeys) : {};
      if (!alive) return;
      setNotes(
        meta
          .map(note => ({
            ...note,
            preview: notePreviewText(
              contents[`${STORAGE_PREFIX_CONTENT}${note.id}`] as Descendant[] | undefined
            ),
          }))
          .sort((a, b) => (b.contentUpdatedAt ?? b.updatedAt) - (a.contentUpdatedAt ?? a.updatedAt))
      );
      setLoaded(true);
    };

    void load().catch(error => console.error("读取笔记列表失败:", error));
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (
        Object.keys(changes).some(key => key === metaKey || key.startsWith(STORAGE_PREFIX_CONTENT))
      ) {
        void load().catch(error => console.error("刷新笔记列表失败:", error));
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(handler);
    };
  }, [url]);

  return { notes, loaded };
}
