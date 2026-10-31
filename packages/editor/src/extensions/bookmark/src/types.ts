import type { Descendant } from "slate";

export type BookmarkAppearance = "row" | "cover" | "compact";

/** 插入时读取的网页信息快照；渲染只读这里，不联网。 */
export interface BookmarkMeta {
  title?: string;
  description?: string;
  siteName?: string;
  /** 存储后的封面地址（本地路径或图床地址） */
  image?: string;
  /** 网站原始 og:image，存储失败或发布站读不到本地文件时回退 */
  sourceImage?: string;
  icon?: string;
  sourceIcon?: string;
  /** 读取失败（网络、拦截页）；没有网页信息但读取成功时不设 */
  failed?: true;
  fetchedAt: number;
}

/** 用户在编辑面板里改过的字段；image 为 null 表示不显示封面。 */
export interface BookmarkOverrides {
  title?: string;
  description?: string;
  image?: string | null;
}

export interface BookmarkElement {
  type: "bookmark";
  url: string;
  meta?: BookmarkMeta;
  overrides?: BookmarkOverrides;
  appearance?: BookmarkAppearance;
  children: Descendant[];
}
