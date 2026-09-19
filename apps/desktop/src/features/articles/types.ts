/**
 * 文章页数据契约。列表条目与标签聚合的类型定义在 @/types/article
 * （ArticlePageItem / ArticleTagCount，主进程分页命令与渲染端共用）；
 * 本文件承载页面派生结构（月分段）。
 */

import type { ArticlePageItem } from "@/types";

/** 置顶段之外的月分段（置顶在视图层单独渲染，不进分桶） */
export interface ArticleMonthSection {
  key: string;
  year: number;
  month: number;
  items: ArticlePageItem[];
  words: number;
}

export type { ArticlePageItem };
