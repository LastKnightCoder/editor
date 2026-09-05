export interface EpubMetadataInput {
  title: string;
  author: string;
  language: string;
  description: string;
  coverImageSrc?: string;
}

export interface EpubChapter {
  id: string;
  title: string;
  xhtml: string;
}

/**
 * nav/ncx 的层级目录条目（按阅读顺序平铺，level 决定嵌套深度）
 */
export interface EpubNavItem {
  title: string;
  /** 内容章节在 payload.chapters 中的下标 */
  chapterIndex: number;
  /** 章节内锚点（分组标题拼入本章正文时使用） */
  anchor?: string;
  /** 嵌套层级，0 为顶层 */
  level: number;
}

export interface EpubAsset {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface EpubExportPayload {
  metadata: EpubMetadataInput;
  chapters: EpubChapter[];
  /** 层级目录条目；缺省时按章节标题平铺生成 */
  nav?: EpubNavItem[];
  assets: EpubAsset[];
  defaultFileName: string;
}

export interface EpubExportResult {
  canceled: boolean;
  filePath: string | null;
  warnings: string[];
}
