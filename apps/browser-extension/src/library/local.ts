/**
 * 伴读库读本机存储：页面笔记（草稿、已存卡片、页面标题）与离线时的标注缓存。
 * 输入是 chrome.storage.local 的整份快照，全部是纯函数。
 */
import type { Descendant } from "slate";
import {
  HIGHLIGHT_COLORS,
  type LibraryList,
  type LibraryPagesParams,
  type WebAnnotation,
  type WebPageSummary,
} from "@tau/shared/browser-companion";
import type { NoteMeta, SavedNote } from "../shared/note-storage";
import { isEmptyNote, notePreview } from "../note/draft";

export type StorageSnapshot = Record<string, unknown>;

export interface LocalNotePage {
  url: string;
  /** 笔记页记下的网页标题；旧草稿没有记录时为空 */
  title: string;
  /** 最近一次写草稿或存卡片的时间；旧草稿没有记录时为 null */
  updatedAt: number | null;
  /** 草稿第一段文字；没有草稿或草稿为空时为 null */
  draft: string | null;
  saved: SavedNote[];
}

const entriesWithPrefix = <T>(snapshot: StorageSnapshot, prefix: string) =>
  Object.entries(snapshot)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [key.slice(prefix.length), value as T] as const);

/** 早期草稿存的是 Markdown 字符串，取第一行文字 */
const draftPreview = (draft: unknown): string | null => {
  if (typeof draft === "string") {
    const line = draft
      .split("\n")
      .map(text => text.replace(/^[#>*\-\s]+/, "").trim())
      .find(Boolean);
    return line ?? null;
  }
  if (!Array.isArray(draft) || isEmptyNote(draft as Descendant[])) return null;
  return notePreview(draft as Descendant[]) || "（无文字）";
};

/** 有草稿或存过卡片的页面，最近写过的在前，没有时间记录的排在最后 */
export function readLocalNotes(snapshot: StorageSnapshot): LocalNotePage[] {
  const pages = new Map<string, LocalNotePage>();
  const pageOf = (url: string) => {
    let page = pages.get(url);
    if (!page) {
      page = { url, title: "", updatedAt: null, draft: null, saved: [] };
      pages.set(url, page);
    }
    return page;
  };
  for (const [url, draft] of entriesWithPrefix<unknown>(snapshot, "note:")) {
    const preview = draftPreview(draft);
    if (preview) pageOf(url).draft = preview;
  }
  for (const [url, saved] of entriesWithPrefix<SavedNote[]>(snapshot, "notes-saved:")) {
    if (Array.isArray(saved) && saved.length) pageOf(url).saved = saved;
  }
  for (const [url, meta] of entriesWithPrefix<NoteMeta>(snapshot, "note-meta:")) {
    const page = pages.get(url);
    if (!page || !meta) continue;
    page.title = meta.title;
    page.updatedAt = meta.updatedAt;
  }
  for (const page of pages.values()) {
    const title = (snapshot[`ann:${page.url}`] as { title?: string } | undefined)?.title;
    if (!page.title && title) page.title = title;
    if (page.updatedAt === null && page.saved.length)
      page.updatedAt = Math.max(...page.saved.map(item => item.savedAt));
  }
  return [...pages.values()].sort((a, b) => (b.updatedAt ?? -1) - (a.updatedAt ?? -1));
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

export function summarize(
  url: string,
  title: string,
  items: readonly WebAnnotation[],
  fallbackTime = 0
): WebPageSummary {
  const colors: WebPageSummary["colors"] = {};
  for (const color of HIGHLIGHT_COLORS) {
    const count = items.filter(item => item.color === color).length;
    if (count) colors[color] = count;
  }
  return {
    url,
    host: hostOf(url),
    title,
    pageTitle: title,
    renamed: false,
    count: items.length,
    noted: items.filter(item => item.note.trim()).length,
    colors,
    lastTime: items.length ? Math.max(...items.map(item => item.createdAt)) : fallbackTime,
  };
}

/** 没连上 Tau 时的页面列表：本机按页缓存的标注（只含在这个浏览器里看过的页面） */
export function readCachedPages(snapshot: StorageSnapshot): WebPageSummary[] {
  return entriesWithPrefix<{ title?: string; items?: WebAnnotation[] }>(snapshot, "ann:")
    .filter(([, page]) => page?.items?.length)
    .map(([url, page]) => summarize(url, page.title ?? "", page.items ?? []));
}

/** 与 Tau 的 library.pages 同口径地筛选、排序、分页本机缓存 */
export function queryCachedPages(
  pages: readonly WebPageSummary[],
  params: LibraryPagesParams,
  snapshot: StorageSnapshot
): LibraryList<WebPageSummary> {
  const query = params.query?.toLowerCase();
  const matches = (page: WebPageSummary) => {
    if (params.url && page.url !== params.url) return false;
    if (params.host && page.host !== params.host) return false;
    if (params.noted && !page.noted) return false;
    if (!query) return true;
    if (`${page.title}\n${page.url}`.toLowerCase().includes(query)) return true;
    const items = (snapshot[`ann:${page.url}`] as { items?: WebAnnotation[] } | undefined)?.items;
    return !!items?.some(item => `${item.text}\n${item.note}`.toLowerCase().includes(query));
  };
  const order: Record<
    LibraryPagesParams["sort"],
    (a: WebPageSummary, b: WebPageSummary) => number
  > = {
    recent: (a, b) => b.lastTime - a.lastTime,
    oldest: (a, b) => a.lastTime - b.lastTime,
    most: (a, b) => b.count - a.count || b.lastTime - a.lastTime,
    title: (a, b) => (a.title || a.url).localeCompare(b.title || b.url, "zh-CN"),
  };
  const filtered = pages.filter(matches).sort(order[params.sort]);
  return {
    items: filtered.slice(params.offset, params.offset + params.limit),
    total: filtered.length,
  };
}
