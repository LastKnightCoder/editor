/**
 * 微信读书域纯逻辑：Notebook（SQLite 缓存 / 网关归一化结果）→ 书架条目与笔记结构。
 * 不依赖 React 与 IPC，可单测。
 */

import type { Metadata, Notebook, Review } from "./service/types";

/* ───────── 书架 ───────── */

export type ReadingStatus = "reading" | "finished" | "unread";

export interface WeReadBook {
  id: string;
  title: string;
  author: string;
  cover: string;
  /** 书架分类（archiveName），未分类为空串 */
  archive: string;
  publisher: string;
  /** 0–100 */
  progress: number;
  /** 累计阅读分钟 */
  minutes: number;
  /** 划线数 */
  notes: number;
  /** 想法数 */
  reviews: number;
  /** 最近阅读日（YYYY-MM-DD），未读为空串 */
  lastRead: string;
  status: ReadingStatus;
  webUrl: string;
}

export function resolveStatus(readInfo: Metadata["readInfo"] | undefined): ReadingStatus {
  const progress = readInfo?.readingProgress ?? 0;
  if ((readInfo?.finishedDate ?? 0) > 0 || progress >= 100) return "finished";
  if (progress > 0 || (readInfo?.readingTime ?? 0) > 0 || (readInfo?.readingBookDate ?? 0) > 0) {
    return "reading";
  }
  return "unread";
}

export function toBook(notebook: Notebook): WeReadBook {
  const meta = notebook.metaData;
  const readInfo = meta.readInfo;
  return {
    id: meta.bookId,
    title: meta.title,
    author: meta.author ?? "",
    cover: meta.cover ?? "",
    archive: meta.archiveName?.trim() ?? "",
    publisher: meta.publisher?.trim() ?? "",
    progress: Math.min(100, Math.max(0, readInfo?.readingProgress ?? 0)),
    minutes: Math.max(0, Math.round((readInfo?.readingTime ?? 0) / 60)),
    notes: meta.noteCount ?? 0,
    reviews: meta.reviewCount ?? 0,
    lastRead: meta.lastReadDate ?? "",
    status: resolveStatus(readInfo),
    webUrl: meta.webUrl ?? meta.url ?? "",
  };
}

export type ShelfStatusFilter = "all" | "reading" | "finished" | "unread" | "notes";
export type ShelfSort = "last" | "progress" | "minutes" | "notes";
export type ShelfLayout = "cover" | "list";

export const STATUS_FILTERS: { value: ShelfStatusFilter; label: string }[] = [
  { value: "all", label: "全部状态" },
  { value: "reading", label: "在读" },
  { value: "finished", label: "读完" },
  { value: "unread", label: "未开始" },
  { value: "notes", label: "有笔记" },
];

export const SHELF_SORTS: { value: ShelfSort; label: string }[] = [
  { value: "last", label: "最近阅读" },
  { value: "progress", label: "阅读进度" },
  { value: "minutes", label: "阅读时长" },
  { value: "notes", label: "笔记数" },
];

export const STATUS_LABEL: Record<ReadingStatus, string> = {
  reading: "在读",
  finished: "读完",
  unread: "未开始",
};

/** 分类 chips：按书数降序，同数按名称 */
export function rankArchives(books: WeReadBook[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const book of books) {
    if (book.archive) counts.set(book.archive, (counts.get(book.archive) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

export function matchStatus(book: WeReadBook, filter: ShelfStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "notes") return book.notes + book.reviews > 0;
  return book.status === filter;
}

export function matchQuery(book: WeReadBook, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q);
}

/** 排序键相同时回落到最近阅读，再到书名 */
export function sortBooks(books: WeReadBook[], sort: ShelfSort): WeReadBook[] {
  const byLast = (a: WeReadBook, b: WeReadBook) =>
    b.lastRead.localeCompare(a.lastRead) || a.title.localeCompare(b.title, "zh-CN");
  const key: Record<Exclude<ShelfSort, "last">, (b: WeReadBook) => number> = {
    progress: b => b.progress,
    minutes: b => b.minutes,
    notes: b => b.notes + b.reviews,
  };
  return [...books].sort(
    sort === "last" ? byLast : (a, b) => key[sort](b) - key[sort](a) || byLast(a, b)
  );
}

/** 「在读」续读行：最近读过的在读书 */
export function readingNow(books: WeReadBook[], limit = 3): WeReadBook[] {
  return sortBooks(
    books.filter(b => b.status === "reading"),
    "last"
  ).slice(0, limit);
}

/* ───────── 笔记 ───────── */

/** 微信读书 style：0 下划线 / 1 马克笔 / 2 波浪线 */
export type HighlightStyle = 0 | 1 | 2;
/** 微信读书 colorStyle：1 红 / 2 紫 / 3 蓝 / 4 绿 / 5 黄 */
export type HighlightColor = 1 | 2 | 3 | 4 | 5;

export const HIGHLIGHT_COLORS: { value: HighlightColor; label: string }[] = [
  { value: 1, label: "红" },
  { value: 2, label: "紫" },
  { value: 3, label: "蓝" },
  { value: 4, label: "绿" },
  { value: 5, label: "黄" },
];

export interface BookNote {
  id: string;
  /** 划线原文，已按段拆分 */
  paragraphs: string[];
  style: HighlightStyle;
  color: HighlightColor;
  /** 想法，已按段拆分 */
  review: string[];
  /** 秒级时间戳，0 = 未知 */
  created: number;
}

export interface NoteChapter {
  key: string;
  title: string;
  notes: BookNote[];
  /** 不挂在划线上的章节想法 */
  thoughts: string[][];
}

export interface BookNotes {
  chapters: NoteChapter[];
  /** 整本书的书评 */
  bookReviews: { id: string; paragraphs: string[]; created: number }[];
}

export const toParagraphs = (text: string | null | undefined): string[] =>
  (text ?? "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

const rangeStart = (range: string | undefined) => {
  const n = Number.parseInt((range ?? "").split("-")[0], 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
};

const clampStyle = (v: number | undefined): HighlightStyle => (v === 1 || v === 2 ? v : 0);
const clampColor = (v: number | undefined): HighlightColor =>
  v === 1 || v === 2 || v === 3 || v === 4 ? v : 5;

const reviewText = (review: Review) => review.content || review.mdContent || "";

/**
 * 按章节合并划线与想法：同一 range 的想法并到划线上；只有想法没有划线时以想法摘录（abstract）
 * 作为原文；没有 range 的想法作为章节想法。
 */
export function buildBookNotes(notebook: Notebook): BookNotes {
  const chapters: NoteChapter[] = [];
  notebook.chapterHighlights.forEach((chapter, index) => {
    const byRange = new Map<string, BookNote>();
    const loose: BookNote[] = [];
    for (const h of chapter.highlights ?? []) {
      const note: BookNote = {
        id: h.bookmarkId,
        paragraphs: toParagraphs(h.markText),
        style: clampStyle(h.style),
        color: clampColor(h.colorStyle),
        review: toParagraphs(h.reviewContent),
        created: h.created ?? 0,
      };
      if (h.range) byRange.set(h.range, note);
      else loose.push(note);
    }
    const thoughts: string[][] = [];
    for (const r of chapter.chapterReviews ?? []) {
      const text = toParagraphs(reviewText(r));
      if (!r.range) {
        if (text.length) thoughts.push(text);
        continue;
      }
      const hit = byRange.get(r.range);
      if (hit) {
        if (!hit.review.length) hit.review = text;
      } else {
        byRange.set(r.range, {
          id: r.reviewId,
          paragraphs: toParagraphs(r.abstract),
          style: 0,
          color: 5,
          review: text,
          created: r.created ?? 0,
        });
      }
    }
    const notes = [
      ...[...byRange.entries()].sort((a, b) => rangeStart(a[0]) - rangeStart(b[0])).map(e => e[1]),
      ...loose,
    ].filter(n => n.paragraphs.length || n.review.length);
    if (notes.length || thoughts.length) {
      chapters.push({
        key: String(chapter.chapterUid ?? chapter.chapterIdx ?? `i${index}`),
        title: chapter.chapterTitle || "未命名章节",
        notes,
        thoughts,
      });
    }
  });

  const bookReviews = (notebook.bookReview?.bookReviews ?? [])
    .map(r => ({
      id: r.reviewId,
      paragraphs: toParagraphs(reviewText(r)),
      created: r.created ?? 0,
    }))
    .filter(r => r.paragraphs.length);

  return { chapters, bookReviews };
}

export function hasNotes(notebook: Notebook): boolean {
  const notes = buildBookNotes(notebook);
  return notes.chapters.length > 0 || notes.bookReviews.length > 0;
}

/** 笔记指纹：笔记本概览的 sort 与笔记总数（与 services/weread 的 NoteFingerprint 同形） */
export interface NoteFingerprintLike {
  sort: number;
  count: number;
}

/**
 * 书架同步后哪些书要拉划线（KL-034）：有笔记且指纹（存在 synckeys.highlights / reviews）变了的书拉取；
 * 上次拉到过笔记、现在概览里已没有笔记的书清空（源端删光了）。full = 有笔记的书全部重拉。
 */
export function planNoteSync(
  notebooks: Notebook[],
  fingerprints: Record<string, NoteFingerprintLike>,
  full = false
): { fetch: string[]; clear: string[] } {
  const fetch: string[] = [];
  const clear: string[] = [];
  for (const { metaData } of notebooks) {
    const fingerprint = fingerprints[metaData.bookId];
    const synckeys = metaData.synckeys ?? {};
    if (fingerprint) {
      if (
        full ||
        synckeys.highlights !== fingerprint.sort ||
        synckeys.reviews !== fingerprint.count
      )
        fetch.push(metaData.bookId);
    } else if ((synckeys.reviews ?? 0) > 0) {
      clear.push(metaData.bookId);
    }
  }
  return { fetch, clear };
}

/** 网关返回空详情（限流、临时失败）时保留已有缓存 */
export function preferNonEmpty(current: Notebook, next: Notebook): Notebook {
  if (!hasNotes(next) && hasNotes(current)) return { ...current, metaData: next.metaData };
  return next;
}

export type NoteFilter = "all" | "review" | HighlightColor;

export function filterNotes(notes: BookNotes, filter: NoteFilter): NoteChapter[] {
  if (filter === "all") return notes.chapters;
  return notes.chapters
    .map(ch => ({
      ...ch,
      notes: ch.notes.filter(n => (filter === "review" ? n.review.length > 0 : n.color === filter)),
      thoughts: filter === "review" ? ch.thoughts : [],
    }))
    .filter(ch => ch.notes.length || ch.thoughts.length);
}

export function countNotes(chapters: NoteChapter[]) {
  let highlights = 0;
  let reviews = 0;
  for (const ch of chapters) {
    highlights += ch.notes.length;
    reviews += ch.notes.filter(n => n.review.length).length + ch.thoughts.length;
  }
  return { highlights, reviews };
}

export function notesToMarkdown(book: WeReadBook, notes: BookNotes): string {
  const lines = [`# ${book.title}`, ""];
  if (book.author) lines.push(`- 作者：${book.author}`, "");
  for (const review of notes.bookReviews) lines.push(...review.paragraphs, "");
  for (const ch of notes.chapters) {
    lines.push(`## ${ch.title}`, "");
    for (const n of ch.notes) {
      if (n.paragraphs.length) lines.push(...n.paragraphs.map(p => `> ${p}`), "");
      if (n.review.length) lines.push(...n.review, "");
    }
    for (const t of ch.thoughts) lines.push(...t, "");
  }
  return lines.join("\n").trim() + "\n";
}

/* ───────── 格式 ───────── */

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

/** 最近阅读日：今天 / 昨天 / N 天前 / 当年 M/D / 往年 YYYY/M/D */
export function formatReadDay(day: string, now = new Date()): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  return y === now.getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
}

export function formatSyncedAt(ts: number | null, now = Date.now()): string {
  if (!ts) return "尚未同步";
  const min = Math.floor((now - ts) / 60_000);
  if (min < 1) return "刚刚同步";
  if (min < 60) return `${min} 分钟前同步`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前同步`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()} 同步`;
}

/** 无封面时的兜底色（按书 id 派生，同一本永远同一色） */
export function coverTone(id: string): 1 | 2 | 3 | 4 | 5 {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}
