import { Note, EHighlightColor } from "./pdf";

// EPUB 标注类型
export type EpubAnnotationType = "highlight" | "underline" | "squiggly";

// EPUB 高亮样式
export type EpubHighlightStyle = "highlight" | "underline" | "squiggly";

// EPUB 元数据
export interface Epub {
  id: number;
  createTime: number;
  updateTime: number;
  tags: string[];
  isLocal: boolean;
  category: string;
  fileName: string;
  filePath: string;
  remoteUrl: string;
  // EPUB 特有字段
  title?: string;
  author?: string;
  coverUrl?: string;
  progressCfi?: string;
  progressPercentage: number;
}

export type CreateEpub = Omit<Epub, "id" | "createTime" | "updateTime">;

// EPUB 标注
export interface EpubAnnotation {
  id: number;
  createTime: number;
  updateTime: number;
  epubId: number;
  cfi: string; // EPUB CFI 位置标识
  type: EpubAnnotationType;
  text?: string; // 标注的文本内容
  color?: EHighlightColor;
  style?: EpubHighlightStyle;
  notes: Note[]; // 与 PDF 统一的笔记格式
  chapterTitle?: string;
  chapterHref?: string;
}

export type CreateEpubAnnotation = Omit<
  EpubAnnotation,
  "id" | "createTime" | "updateTime"
>;

// EPUB 书签
export interface EpubBookmark {
  id: number;
  createTime: number;
  updateTime: number;
  epubId: number;
  cfi: string;
  title?: string;
  chapterTitle?: string;
}

export type CreateEpubBookmark = Omit<
  EpubBookmark,
  "id" | "createTime" | "updateTime"
>;

// 目录项
export interface TOCItem {
  id: number;
  label: string;
  href: string;
  cfi?: string;
  subitems?: TOCItem[];
}

// 书籍文档信息
export interface BookDoc {
  metadata: {
    title?: string;
    author?: string;
    language?: string | string[];
    publisher?: string;
    description?: string;
    coverImageFile?: string;
    coverImageUrl?: string;
  };
  toc?: TOCItem[];
  dir?: string;
}

// 阅读进度
export interface ReadingProgress {
  cfi: string;
  percentage: number;
  chapterTitle?: string;
  timestamp: number;
}

// FoliateView 接口 - 来自 foliate-js
export interface FoliateView extends HTMLElement {
  open: (book: BookDoc) => Promise<void>;
  close: () => void;
  init: (options: { lastLocation?: string }) => void;
  goTo: (href: string) => void;
  goToFraction: (fraction: number) => void;
  prev: (distance?: number) => void;
  next: (distance?: number) => void;
  goLeft: () => void;
  goRight: () => void;
  getCFI: (index: number, range: Range) => string;
  resolveCFI: (cfi: string) => { index: number; anchor: (doc: Document) => Range };
  addAnnotation: (
    annotation: {
      value: string;
      type?: EpubAnnotationType;
      color?: string;
    },
    remove?: boolean
  ) => { index: number; label: string };
  book: BookDoc;
  history: {
    canGoBack: boolean;
    canGoForward: boolean;
    back: () => void;
    forward: () => void;
    clear: () => void;
  };
  renderer: {
    scrolled?: boolean;
    size: number;
    viewSize: number;
    start: number;
    end: number;
    page: number;
    pages: number;
    setAttribute: (name: string, value: string | number) => void;
    removeAttribute: (name: string) => void;
    next: () => Promise<void>;
    prev: () => Promise<void>;
    setStyles?: (css: string) => void;
    getContents: () => Array<{ doc: Document; index?: number; overlayer?: unknown }>;
    scrollToAnchor: (anchor: number | Range) => void;
    addEventListener: (
      type: string,
      listener: EventListener,
      option?: AddEventListenerOptions
    ) => void;
    removeEventListener: (type: string, listener: EventListener) => void;
  };
}

// 包装 FoliateView 以适配我们的标注格式
export const wrappedFoliateView = (originalView: FoliateView): FoliateView => {
  const originalAddAnnotation = originalView.addAnnotation.bind(originalView);
  originalView.addAnnotation = (
    annotation: { value: string; type?: EpubAnnotationType; color?: string },
    remove = false
  ) => {
    return originalAddAnnotation(annotation, remove);
  };
  return originalView;
};
