/** 阅读器外壳与每页图层之间共享的状态与动作（页面由引擎虚拟滚动渲染，经 context 取值免逐层传参） */

import { createContext, useContext } from "react";
import type { PdfAnnotationObject, Rect } from "@embedpdf/models";
import type { EHighlightColor, Note, PdfAnnotation } from "@/types";

export type ReaderOverlay =
  /** 新选区：工具条挂在选区第一页的包围盒上 */
  | { kind: "selection"; pageIndex: number; rect: Rect; text: string }
  /** 刚框选的区域（Alt 拖动），截图已就绪 */
  | { kind: "area-new"; pageIndex: number; rect: Rect; blob: Blob }
  /** 点中已有区域标注 */
  | { kind: "area"; recordId: number };

export interface NoteTarget {
  /** null = 页边新批注草稿（保存时才落库），位置取 rect.origin.y */
  objectId: string | null;
  pageIndex: number;
  rect: Rect;
}

export interface PageHighlight {
  pageIndex: number;
  rects: Rect[];
}

export interface ReaderContextValue {
  records: PdfAnnotation[];
  bookmarkedPages: ReadonlySet<number>;
  overlay: ReaderOverlay | null;
  /** 正在写笔记的标注：引擎对象 id + 位置（刚建的标注可能还没落库，位置不能从记录取） */
  noteTarget: NoteTarget | null;
  /** 钉住的笔记卡（记录 id） */
  pinned: number | null;
  /** 从列表跳过来时闪一下的图钉（记录 id） */
  flashPin: number | null;
  searchHits: PageHighlight[];
  /** searchHits 的扁平下标 → 当前命中所在页与矩形 */
  currentHit: { pageIndex: number; rect: Rect } | null;
  /** 引用跳转闪烁 */
  flash: PageHighlight | null;
  canAsk: boolean;
  newStyle: "highlight" | "underline";
  /** 页边宽度（已缩放，像素）；0 = 页边收起，笔记显示为页内图钉 */
  marginWidth: number;

  toggleBookmark: (pageNumber: number) => void;
  setPinned: (recordId: number | null) => void;
  selectArea: (recordId: number | null) => void;
  dismissOverlay: () => void;

  /* 新选区 */
  markSelection: (color: EHighlightColor) => void;
  toggleNewStyle: () => void;
  noteSelection: () => void;
  askSelection: () => void;
  copySelection: () => void;

  /* 新区域 */
  saveNewArea: () => void;
  askNewArea: () => void;
  copyNewArea: () => void;

  /* 已有标注（文本标注传引擎对象，区域标注传记录） */
  recolor: (target: PdfAnnotationObject | PdfAnnotation, color: EHighlightColor) => void;
  toggleStyle: (object: PdfAnnotationObject) => void;
  openNote: (target: PdfAnnotationObject | PdfAnnotation) => void;
  ask: (target: PdfAnnotationObject | PdfAnnotation) => void;
  copy: (target: PdfAnnotationObject | PdfAnnotation) => void;
  remove: (target: PdfAnnotationObject | PdfAnnotation) => void;
  clearNote: (record: PdfAnnotation) => void;

  /* 页边批注 */
  draftMargin: (pageIndex: number, y: number) => void;
  saveMarginDraft: (notes: Note[]) => Promise<unknown>;

  closeNote: () => void;
  saveNote: (record: PdfAnnotation, notes: Note[]) => Promise<unknown>;
}

/**
 * 页内浮层（工具条、笔记卡、图钉、书签…）的标记属性：登记为引擎交互的排除规则，
 * 点在它们上面不会被引擎当成页面点击（清掉选区、开始新划线）。
 */
export const OVERLAY_ATTR = "data-pdf-overlay";
export const overlayProps = { [OVERLAY_ATTR]: "" } as const;

export const ReaderContext = createContext<ReaderContextValue | null>(null);

export function useReader(): ReaderContextValue {
  const value = useContext(ReaderContext);
  if (!value) throw new Error("useReader 必须在 PdfReader 内使用");
  return value;
}
