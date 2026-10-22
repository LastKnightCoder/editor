import type { LucideIcon } from "lucide-react";
import { Descendant } from "slate";
import { ICard } from "@/types/card";
import { IArticle } from "@/types/article";
import { Project, ProjectItem, EProjectItemType } from "@/types/project";
import { PublishContentType } from "@/types/publish";

/**
 * 卡片列表项
 */
export interface CardListItem {
  id: number;
  title: string;
  summary: string;
  tags: string[];
  updateTime: number;
  raw: ICard;
}

/**
 * 卡片标签树节点
 */
export interface CardTagNode {
  id: string;
  label: string;
  depth: number;
  count: number;
  cards: CardListItem[];
  children: CardTagNode[];
}

/**
 * 文档树节点（用于项目）
 */
export interface DocTreeNode {
  id: number;
  title: string;
  hasContent: boolean;
  content: Descendant[];
  children: DocTreeNode[];
}

/**
 * 实体作用域 - 全部
 */
export interface EntityScopeAll {
  mode: "all";
}

/**
 * 实体作用域 - 部分
 */
export interface EntityScopePartial {
  mode: "partial";
  nodeIds: Set<number>;
  /** 存量范围数据损坏时的标记：按空范围处理并提示用户重新选择 */
  corrupted?: boolean;
}

/**
 * 实体作用域类型
 */
export type EntityScope = EntityScopeAll | EntityScopePartial;

/**
 * 实体弹窗状态
 */
export interface EntityModalState {
  type: "project";
  entity: Project;
}

/**
 * Tab 配置项
 */
export interface TabConfig {
  key: PublishContentType;
  label: string;
  description: string;
  icon: LucideIcon;
}

/**
 * 列表选择状态过滤：全部 / 已选 / 未选
 */
export type SelectionFilter = "all" | "selected" | "unselected";

/**
 * 选择项基础接口
 */
export interface SelectableItem {
  id: number;
  title: string;
  summary?: string;
}

/**
 * 文章列表项
 */
export interface ArticleListItem extends SelectableItem {
  description: string;
  raw: IArticle;
}

/**
 * 卡片标签树构建器节点（内部使用）
 */
export interface CardTagNodeBuilder {
  label: string;
  count: number;
  cards: CardListItem[];
  children: Map<string, CardTagNodeBuilder>;
}

// 重导出相关类型
export type { ICard, IArticle, Project, ProjectItem, PublishContentType };

export { EProjectItemType };
