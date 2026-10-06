import { Descendant } from "slate";
import type { PdfAnnotationObject, PdfBookmarkObject } from "@embedpdf/models";

export enum EHighlightColor {
  Red = "red",
  Blue = "blue",
  Green = "green",
  Yellow = "yellow",
  Purple = "purple",
  Pink = "pink",
}

export interface Note {
  id: string;
  note: Descendant[];
}

// 区域标注数据
export interface AreaAnnotationData {
  rect: { x: number; y: number; width: number; height: number };
  captureUrl: string; // 截图上传后的 URL
  pageIndex: number;
}

/** margin = 页边批注：不依附原文，位置是 annotation.pageIndex + rect.origin.y，内容全在 notes */
export type PdfAnnotationType = "text-markup" | "area" | "margin";

export interface Pdf {
  id: number;
  createTime: number;
  updateTime: number;
  tags: string[];
  isLocal: boolean;
  category: string;
  fileName: string;
  filePath: string;
  remoteUrl: string;
  /** 生成缩略图时顺带记录；未打开过的文件为 null */
  pageCount?: number | null;
  lastOpenTime?: number | null;
  /** 上次读到的页（从 1 开始） */
  lastPage?: number | null;
}

/** PDF 列表条目：Pdf 行 + 主进程聚合的标注数与缩略图 */
export interface PdfLibraryItem extends Pdf {
  annotationCount: number;
  /** 缩略图绝对路径（位于编辑器目录内，可经 convertFileSrc 显示）；未生成为 null */
  thumbnailPath: string | null;
  /** 缩略图文件修改时间，用作显示时的缓存版本 */
  thumbnailVersion: number | null;
  /** 本地文件已不在原路径 */
  fileMissing: boolean;
}

export interface PdfBookmark {
  id: number;
  createTime: number;
  updateTime: number;
  pdfId: number;
  bookmark: PdfBookmarkObject;
}

export type CreatePdfBookmark = Omit<PdfBookmark, "id" | "createTime" | "updateTime">;

export interface PdfAnnotation {
  id: number;
  createTime: number;
  updateTime: number;
  pdfId: number;
  annotation: PdfAnnotationObject;
  color?: EHighlightColor;
  notes: Array<Note>;
  // 新增：区分标注类型
  type?: PdfAnnotationType;
  // 新增：区域标注数据
  areaData?: AreaAnnotationData;
}

export type CreatePdfAnnotation = Omit<PdfAnnotation, "id" | "createTime" | "updateTime"> & {
  /** 撤销删除时带回原 id，摘录 / 谱系等按 id 的指向不断（KL-036）；被占用时退回新 id */
  id?: number;
};

export interface PdfIndexStatus {
  pdfId: number;
  state: "pending" | "building" | "ready" | "failed";
  pageCount: number;
  updatedAt: number | null;
  fingerprint?: string;
  error?: string;
  partial?: boolean;
  currentStage?: "extracting" | "structuring" | "embedding" | "persisting";
  progressCurrent?: number;
  progressTotal?: number;
  progressLabel?: string;
}

export interface PdfPageContent {
  pdfId: number;
  pageNumber: number;
  content: string;
  charCount: number;
}

export interface PdfOutlineNode {
  id: string;
  title: string;
  pageNumber: number | null;
  orderIndex: number;
  children: PdfOutlineNode[];
}

export interface PdfSectionBreadcrumb {
  id: string;
  title: string;
}

export interface PdfSectionNode {
  id: string;
  parentId: string | null;
  title: string;
  level: number;
  startPage: number;
  endPage: number;
  orderIndex: number;
  pathTitles: string[];
  source: "outline" | "inferred" | "synthetic";
  children: PdfSectionNode[];
}

export interface PdfDocumentMap {
  pdfId: number;
  fileName: string;
  pageCount: number;
  indexStatus: PdfIndexStatus;
  sections: PdfSectionNode[];
}

export interface PdfSectionDetail {
  pdfId: number;
  sectionInfo: Omit<PdfSectionNode, "children">;
  breadcrumbs: PdfSectionBreadcrumb[];
  pages: PdfPageContent[];
  content: string;
}

export interface PdfSearchResult {
  pdfId: number;
  pageNumber: number;
  chunkIndex: number;
  snippet: string;
  content: string;
  source: "fts" | "vec";
  score: number;
  charStart: number;
  charEnd: number;
  rrfScore?: number;
  sectionId?: string;
  sectionTitle?: string;
  sectionPath?: string[];
  sectionStartPage?: number;
  sectionEndPage?: number;
}

export interface PdfDocumentInfo {
  pdfId: number;
  fileName: string;
  pageCount: number;
  indexStatus: PdfIndexStatus;
}

export interface PdfAnnotationContext {
  id: number;
  pdfId: number;
  pageNumber: number;
  type: PdfAnnotationType;
  color?: EHighlightColor;
  snippet?: string;
  notes: Array<Note>;
  areaData?: AreaAnnotationData;
}
