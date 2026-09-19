import { Descendant } from "slate";
import type { IPodcast } from "./podcast";

export interface ICreateArticle {
  title: string;
  author: string;
  tags: string[];
  links: number[];
  content: Descendant[];
  bannerBg: string;
  bannerPosition?: string;
  isTop: boolean;
  isDelete: boolean;
  count: number;
}

export interface IUpdateArticle extends Omit<ICreateArticle, "content" | "count"> {
  id: number;
  contentId: number;
}

export interface IArticle extends ICreateArticle {
  id: number;
  create_time: number;
  update_time: number;
  contentId: number;
  podcastId?: number;
  podcast?: IPodcast;
}

/** 文章页列表条目：轻量分页契约（不携带正文全文） */
export interface ArticlePageItem {
  id: number;
  title: string;
  author: string;
  createTime: number;
  updateTime: number;
  tags: string[];
  bannerBg: string;
  bannerPosition: string;
  isTop: boolean;
  words: number;
  /** Slate JSON 前缀原文（可能截断），摘要由渲染端派生 */
  excerpt: string;
}

/** 文章标签聚合（过滤 pills 数据源） */
export interface ArticleTagCount {
  tag: string;
  count: number;
}
