/**
 * 正文之间的显式连接（content_links，无向边、绑定 contents.id）。
 * 共用同一份正文的身份（卡片、文章、项目文档、日记及其投影）共享同一组连接。
 */

import type { EntityRef } from "@/entity/ref";

/** content_links 的一条边；contentId 恒为较小一侧（规范化存储） */
export interface ContentLinkEdge {
  contentId: number;
  targetContentId: number;
  createTime: number;
}

/** 显式连接的目标：主进程已解析为代表身份（ENTITY_REF_PRIORITY 口径）与标题 */
export interface ContentLinkTarget {
  ref: EntityRef;
  title: string;
  /** 目标正文 id（连接的落点） */
  contentId: number;
}

/** 按正文分组的连接列表（content-links:list-by-content-ids 的返回条目） */
export interface ContentLinksOfContent {
  contentId: number;
  targets: ContentLinkTarget[];
}
