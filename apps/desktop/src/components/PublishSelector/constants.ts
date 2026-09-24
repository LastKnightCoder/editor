import { Layers, FileText, MessageSquare, Folder } from "lucide-react";
import { PublishContentType } from "@/types/publish";
import { ECardCategory } from "@/types/card";
import { TabConfig } from "./types";

/**
 * Tab 配置
 */
export const TABS: TabConfig[] = [
  {
    key: "card",
    label: "卡片",
    description: "按标签选择卡片",
    icon: Layers,
  },
  {
    key: "article",
    label: "文章",
    description: "选择文章发布",
    icon: FileText,
  },
  {
    key: "quest",
    label: "问题管理",
    description: "按分类选择问题",
    icon: MessageSquare,
  },
  {
    key: "project",
    label: "项目",
    description: "选择项目文档",
    icon: Folder,
  },
];

/**
 * 卡片分类标签映射
 */
export const CARD_CATEGORY_LABEL: Record<ECardCategory, string> = {
  [ECardCategory.Temporary]: "临时卡片",
  [ECardCategory.Permanent]: "永久卡片",
  [ECardCategory.Theme]: "主题卡片",
  [ECardCategory.Literature]: "文献卡片",
};

/**
 * 内容类型中文名称
 */
export const CONTENT_TYPE_LABEL: Record<PublishContentType, string> = {
  card: "卡片",
  article: "文章",
  quest: "问题管理",
  project: "项目",
};

/**
 * 空列表提示文案
 */
export const EMPTY_PLACEHOLDER: Record<PublishContentType, string> = {
  card: "暂无卡片",
  article: "暂无文章",
  quest: "暂无问题条目",
  project: "暂无项目",
};

/**
 * 搜索占位符文案
 */
export const SEARCH_PLACEHOLDER: Record<PublishContentType, string> = {
  card: "搜索卡片标题或标签…",
  article: "搜索文章标题…",
  quest: "搜索问题标题或分类…",
  project: "搜索项目名称…",
};
