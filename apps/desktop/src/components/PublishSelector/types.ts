import type { LucideIcon } from "lucide-react";
import { Descendant } from "slate";
import { ICard, ECardCategory } from "@/types/card";
import { IArticle } from "@/types/article";
import { Project, ProjectItem, EProjectItemType } from "@/types/project";
import { IDocument, IDocumentItem } from "@/types/document";
import { PublishContentType } from "@/types/publish";
import { IQuestion } from "@/types/question";
import { QuestionGroupDTO } from "@/commands/question-group";

/**
 * 卡片列表项
 */
export interface CardListItem {
  id: number;
  title: string;
  summary: string;
  tags: string[];
  category: ECardCategory;
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
 * 文档树节点（用于项目和知识库）
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
}

/**
 * 实体作用域类型
 */
export type EntityScope = EntityScopeAll | EntityScopePartial;

/**
 * 实体弹窗状态
 */
export interface EntityModalState {
  type: "project" | "document" | "quest";
  entity: Project | IDocument;
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

export interface QuestGroupItem {
  id: number;
  title: string;
  color?: string;
  questions: IQuestion[];
  raw: QuestionGroupDTO;
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
export type {
  ICard,
  ECardCategory,
  IArticle,
  IQuestion,
  Project,
  ProjectItem,
  IDocument,
  IDocumentItem,
  PublishContentType,
};

export { EProjectItemType };
