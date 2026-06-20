import type { HomeTrendType } from "../../hooks/useHomeData";

export type TrendRange = "week" | "month" | "year" | "all";
export type TrendMode = "increment" | "cumulative";
export type TrendMetric = "count" | "wordsCount";
export type TrendCategory = "all" | HomeTrendType;

export const TREND_TYPES: HomeTrendType[] = [
  "card",
  "article",
  "project-item",
  "document-item",
];

export const TYPE_LABELS: Record<HomeTrendType, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "document-item": "知识库文档",
};

export const TYPE_COLORS: Record<HomeTrendType, string> = {
  card: "#3b82f6",
  article: "#22c55e",
  "project-item": "#f59e0b",
  "document-item": "#a855f7",
};

export const RANGES: { key: TrendRange; label: string }[] = [
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "year", label: "年" },
  { key: "all", label: "总览" },
];

export const MODES: { key: TrendMode; label: string }[] = [
  { key: "increment", label: "增量" },
  { key: "cumulative", label: "累计" },
];

export const METRICS: { key: TrendMetric; label: string }[] = [
  { key: "count", label: "数量" },
  { key: "wordsCount", label: "字数" },
];

export const CATEGORIES: { key: TrendCategory; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "card", label: "卡片" },
  { key: "article", label: "文章" },
  { key: "project-item", label: "项目文档" },
  { key: "document-item", label: "知识库文档" },
];
