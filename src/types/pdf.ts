import { Descendant } from "slate";

export enum EHighlightType {
  Text = "text",
  Area = "area",
}

export enum EHighlightTextStyle {
  Highlight = "highlight",
  Underline = "underline",
  Wave = "wave",
}

export enum EHighlightColor {
  Red = "red",
  Blue = "blue",
  Green = "green",
  Yellow = "yellow",
  Purple = "purple",
  Pink = "pink",
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface RectWithPageNumber extends Rect {
  pageNumber: number;
}

export interface RectPercent {
  top: string;
  left: string;
  width: string;
  height: string;
}

export interface RectPercentWithPageNumber extends RectPercent {
  pageNum: number;
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

export interface PdfHighlight {
  id: number;
  createTime: number;
  updateTime: number;
  pdfId: number;
  color: EHighlightColor;
  highlightType: EHighlightType;
  rects: Array<RectPercentWithPageNumber>;
  boundingClientRect: RectPercentWithPageNumber;
  highlightTextStyle: EHighlightTextStyle;
  pageNum: number;
  content: string;
  image: string;
  notes: Array<Note>;
}
