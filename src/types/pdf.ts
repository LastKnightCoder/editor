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
}

export type CreatePdfAnnotation = Omit<
  PdfAnnotation,
  "id" | "createTime" | "updateTime"
>;
