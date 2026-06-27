import { Descendant } from "slate";
import type { PdfAnnotationObject, PdfBookmarkObject } from "@embedpdf/models";
import type { ChatSessionMessage } from "./llm";

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

export type PdfAnnotationType = "text-markup" | "area";

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
}

export interface PdfBookmark {
  id: number;
  createTime: number;
  updateTime: number;
  pdfId: number;
  bookmark: PdfBookmarkObject;
}

export type CreatePdfBookmark = Omit<
  PdfBookmark,
  "id" | "createTime" | "updateTime"
>;

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

export type CreatePdfAnnotation = Omit<
  PdfAnnotation,
  "id" | "createTime" | "updateTime"
>;

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
  rerankScore?: number;
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

export interface PdfChatMessage {
  id: number;
  pdfId: number;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  messageSchemaVersion?: number;
  title: string;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
}

export interface CreatePdfChat {
  pdfId: number;
  messages: ChatSessionMessage[];
  title?: string;
  parentChatId?: number | null;
  branchIndex?: number;
}

export interface UpdatePdfChat {
  id: number;
  messages?: ChatSessionMessage[];
  title?: string;
  archived?: boolean;
  parentChatId?: number | null;
  branchIndex?: number;
}
