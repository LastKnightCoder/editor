/** PDF 列表域模型：列表条目、来源筛选、排序、最近打开与展示格式（纯函数） */

import type { PdfIndexStatus, PdfLibraryItem } from "@/types";

export type PdfSource = "all" | "local" | "remote";
export type PdfSort = "opened" | "added" | "name" | "annotations";
export type PdfLayout = "cover" | "list";
/** AI 检索状态：没有索引库即 none */
export type PdfIndexState = "ready" | "building" | "failed" | "none";

export interface PdfEntry {
  id: number;
  /** 去掉 .pdf 后缀的文件名 */
  title: string;
  isLocal: boolean;
  pageCount: number | null;
  annotationCount: number;
  addedAt: number;
  openedAt: number | null;
  lastPage: number | null;
  /** 可直接给 <img> 的地址（带版本号）；未生成为 null */
  thumbnailUrl: string | null;
  fileMissing: boolean;
  index: PdfIndexState;
  /** 原始行：写操作回传给命令 */
  raw: PdfLibraryItem;
}

export const PDF_SOURCES: { value: PdfSource }[] = [
  { value: "all" },
  { value: "local" },
  { value: "remote" },
];

export const PDF_SORTS: { value: PdfSort }[] = [
  { value: "opened" },
  { value: "added" },
  { value: "name" },
  { value: "annotations" },
];

export function pdfTitle(fileName: string, fallback = "未命名 PDF"): string {
  const title = fileName.replace(/\.pdf$/i, "").trim();
  return title || fileName || fallback;
}

function toIndexState(status: PdfIndexStatus | undefined): PdfIndexState {
  if (!status) return "none";
  if (status.state === "ready") return "ready";
  if (status.state === "failed") return "failed";
  // pending 是建库后尚未开跑的初始态，和 building 一样视为进行中
  return "building";
}

export function toEntry(
  item: PdfLibraryItem,
  status?: PdfIndexStatus,
  thumbnailUrl: string | null = null
): PdfEntry {
  return {
    id: item.id,
    title: pdfTitle(item.fileName),
    isLocal: item.isLocal,
    pageCount: item.pageCount || status?.pageCount || null,
    annotationCount: item.annotationCount,
    addedAt: item.createTime,
    openedAt: item.lastOpenTime ?? null,
    lastPage: item.lastPage ?? null,
    thumbnailUrl,
    fileMissing: item.fileMissing,
    index: toIndexState(status),
    raw: item,
  };
}

export function matchSource(entry: PdfEntry, source: PdfSource): boolean {
  if (source === "all") return true;
  return source === "local" ? entry.isLocal : !entry.isLocal;
}

export function matchQuery(entry: PdfEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || entry.raw.fileName.toLowerCase().includes(q);
}

/** 排序；「最近打开」里从未打开过的排在最后、之间按添加时间 */
export function sortEntries(entries: PdfEntry[], sort: PdfSort): PdfEntry[] {
  const list = [...entries];
  switch (sort) {
    case "name":
      return list.sort((a, b) => a.title.localeCompare(b.title, "zh-CN", { numeric: true }));
    case "annotations":
      return list.sort((a, b) => b.annotationCount - a.annotationCount || b.addedAt - a.addedAt);
    case "added":
      return list.sort((a, b) => b.addedAt - a.addedAt);
    case "opened":
      return list.sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0) || b.addedAt - a.addedAt);
  }
}

/** 「最近打开」续读行：打开过且文件在的，按打开时间取前 n 个 */
export function recentEntries(entries: PdfEntry[], n = 3): PdfEntry[] {
  return entries
    .filter(e => e.openedAt && !e.fileMissing)
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
    .slice(0, n);
}

/** 文字封面的色调：按 id 派生，同一文件稳定 */
export function coverTone(id: number): 1 | 2 | 3 | 4 | 5 {
  return ((Math.abs(id) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

/** 从链接推断文件名：取路径末段，没有 .pdf 后缀就补上 */
export function fileNameFromUrl(url: string): string {
  let last = "";
  try {
    last = decodeURIComponent(new URL(url.trim()).pathname.split("/").filter(Boolean).pop() ?? "");
  } catch {
    return "";
  }
  if (!last) return "";
  return /\.pdf$/i.test(last) ? last : `${last}.pdf`;
}
