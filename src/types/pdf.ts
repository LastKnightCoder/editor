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
