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
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
    ),
  },
  {
    key: "article",
    label: "文章",
    description: "选择文章发布",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    key: "project",
    label: "项目",
    description: "选择项目文档",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    ),
  },
  {
    key: "document",
    label: "知识库",
    description: "选择知识库文档",
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
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
  project: "项目",
  document: "知识库",
};

/**
 * 空列表提示文案
 */
export const EMPTY_PLACEHOLDER: Record<PublishContentType, string> = {
  card: "暂无卡片",
  article: "暂无文章",
  project: "暂无项目",
  document: "暂无知识库",
};

/**
 * 搜索占位符文案
 */
export const SEARCH_PLACEHOLDER: Record<PublishContentType, string> = {
  card: "搜索卡片标题或标签...",
  article: "搜索文章标题...",
  project: "搜索项目名称...",
  document: "搜索知识库名称...",
};
