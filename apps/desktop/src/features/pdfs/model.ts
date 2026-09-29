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

export const PDF_SOURCES: { value: PdfSource; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "local", label: "本地" },
  { value: "remote", label: "远程" },
];

export const PDF_SORTS: { value: PdfSort; label: string }[] = [
  { value: "opened", label: "最近打开" },
  { value: "added", label: "添加时间" },
  { value: "name", label: "名称" },
  { value: "annotations", label: "标注数" },
];

export const INDEX_LABEL: Record<PdfIndexState, string> = {
  ready: "可检索",
  building: "索引中",
  failed: "索引失败",
  none: "未索引",
};

export function pdfTitle(fileName: string): string {
  const title = fileName.replace(/\.pdf$/i, "").trim();
  return title || fileName || "未命名 PDF";
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

/** 今天 / 昨天 / n 天前 / 月/日（跨年带年份） */
export function formatDay(ts: number | null, now = new Date()): string {
  if (!ts) return "—";
  const date = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  const md = `${date.getMonth() + 1}/${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? md : `${date.getFullYear()}/${md}`;
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
