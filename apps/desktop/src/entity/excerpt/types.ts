/**
 * 摘录（主库 excerpt）：来源不是主库行的划线——微信读书、浏览器插件。纯 TypeScript，主进程与渲染端共用。
 *
 * 唯一键 (source_type, external_id)；源端删除即软删除、保留引文（KL-032）。anchor 只存来源原生定位，
 * quote 即引述锚点的 exact，不做模糊找回（KL-038）。
 */

export const EXCERPT_SOURCE_TYPES = ["weread", "web"] as const;

export type ExcerptSourceType = (typeof EXCERPT_SOURCE_TYPES)[number];

/** 微信读书：章节与 range；插件：XPath 与偏移 */
export type ExcerptAnchor =
  | { chapterUid: number; chapterIdx: number; chapterTitle: string; range: string }
  | { startXPath: string; startOffset: number; endXPath: string; endOffset: number };

/** 一个来源（一本书 / 一个网页）同步时给出的一条摘录 */
export interface ExcerptInput {
  externalId: string;
  quote: string;
  note: string;
  anchor: ExcerptAnchor | null;
  color: string | null;
  /** 来源里的创建时间（毫秒） */
  sourceTime: number | null;
}

export interface Excerpt extends ExcerptInput {
  id: number;
  sourceType: ExcerptSourceType;
  sourceKey: string;
  sourceTitle: string;
  createTime: number;
  updateTime: number;
  isDeleted: boolean;
}

export interface ExcerptSyncResult {
  inserted: number;
  updated: number;
  deleted: number;
}

export const isExcerptSourceType = (value: unknown): value is ExcerptSourceType =>
  typeof value === "string" && (EXCERPT_SOURCE_TYPES as readonly string[]).includes(value);
