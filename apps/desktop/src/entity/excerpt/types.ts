/**
 * 摘录（主库 excerpt）：来源不是主库行的划线，由提供方写入——内置网页划线（web）或插件（来源类型即插件 ID）。
 * 纯 TypeScript，主进程与渲染端共用。
 *
 * 唯一键 (source_type, external_id)；源端删除即软删除、保留引文（KL-032）。anchor 是提供方私有定位，宿主只存不读；
 * 展示只用 source_title、location 与提供方名称，打开原处由提供方或 url 承担。
 */

/** 内置提供方：浏览器插件的网页划线 */
export const WEB_EXCERPT_SOURCE = "web";

/** 提供方私有定位（JSON 对象），宿主不解读 */
export type ExcerptAnchor = { [key: string]: unknown };

/** 一个来源（一本书 / 一个网页）同步时给出的一条摘录 */
export interface ExcerptInput {
  externalId: string;
  quote: string;
  note: string;
  /** 给人看的位置：章节、页码 */
  location: string;
  /** 打开原处的外部链接兜底（条目深链或来源链接） */
  url: string | null;
  anchor: ExcerptAnchor | null;
  color: string | null;
  /** 来源里的创建时间（毫秒） */
  sourceTime: number | null;
}

export interface Excerpt extends ExcerptInput {
  id: number;
  sourceType: string;
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

export interface ExcerptSourceSummary {
  key: string;
  title: string;
  /** 未软删除的条目数 */
  count: number;
}

export const hasExcerptChanges = (result: ExcerptSyncResult | null | undefined): boolean =>
  !!result && result.inserted + result.updated + result.deleted > 0;
