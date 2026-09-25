/**
 * 问题页纯函数：状态元信息、列表分段排序、材料类型元信息、轨迹文案与统计。
 */

import {
  File,
  FileText,
  FolderKanban,
  Layers,
  PenLine,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type {
  QuestionEvent,
  QuestionLinkTargetType,
  QuestionMaterial,
  QuestionStatus,
  QuestionSummary,
} from "@/types";

export const DAY_MS = 86_400_000;

/** 问题行拖到分组 chip 上移动分组的拖拽数据类型 */
export const QUESTION_DRAG_TYPE = "application/x-tau-question";

export const STATUS_META: Record<QuestionStatus, { label: string; hint: string }> = {
  in_progress: { label: "探究中", hint: "正在积累材料" },
  not_started: { label: "待探究", hint: "收集来还没动" },
  resolved: { label: "已解答", hint: "已有答案" },
};

/** 列表分段顺序：正在做的在最前 */
export const SECTION_ORDER: QuestionStatus[] = ["in_progress", "not_started", "resolved"];
/** 状态条 / 数字键 1-3 的顺序：按学习阶段 */
export const STATUS_STEPS: QuestionStatus[] = ["not_started", "in_progress", "resolved"];

export const TARGET_META: Record<QuestionLinkTargetType, { label: string; icon: LucideIcon }> = {
  card: { label: "卡片", icon: Layers },
  article: { label: "文章", icon: FileText },
  project_item: { label: "项目文档", icon: File },
  project: { label: "项目", icon: FolderKanban },
  white_board: { label: "白板", icon: Presentation },
  answer: { label: "独立答案", icon: PenLine },
};

/** 构成计数的展示顺序 */
export const COMPOSITION_ORDER: QuestionLinkTargetType[] = [
  "card",
  "article",
  "project_item",
  "project",
  "white_board",
  "answer",
];

export interface QuestionSection {
  status: QuestionStatus;
  items: QuestionSummary[];
}

/** 按状态分段；已解答按解答时间倒序，其余按最近活动倒序 */
export function sectionize(list: QuestionSummary[]): QuestionSection[] {
  return SECTION_ORDER.map(status => ({
    status,
    items: list
      .filter(q => q.status === status)
      .sort((a, b) =>
        status === "resolved"
          ? (b.resolvedTime ?? b.updateTime) - (a.resolvedTime ?? a.updateTime)
          : b.lastActivityTime - a.lastActivityTime
      ),
  })).filter(section => section.items.length > 0);
}

export function statusCounts(list: { status: QuestionStatus }[]) {
  const counts: Record<QuestionStatus, number> = { not_started: 0, in_progress: 0, resolved: 0 };
  list.forEach(q => counts[q.status]++);
  return counts;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 今天 / 昨天 / N 天前 / M月D日 */
export function relativeDay(ts: number, now: number): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${sameYear ? "" : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日`;
}

export function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 自然日跨度（至少 1 天） */
export function daySpan(from: number, to: number): number {
  return Math.max(1, Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS) + 1);
}

export function formatWords(words: number): string {
  if (words <= 0) return "";
  return words >= 1000 ? `${(words / 1000).toFixed(1)}k 字` : `${words} 字`;
}

const PREVIEWABLE = new Set<QuestionMaterial["targetType"]>(["card", "article", "project_item"]);

/** 背后有 content 的材料（卡片 / 文章 / 项目文档）可弹窗预览 */
export function canPreview(material: QuestionMaterial): boolean {
  return !material.missing && material.contentId != null && PREVIEWABLE.has(material.targetType);
}

export function materialMeta(material: QuestionMaterial): string {
  const words =
    material.targetType === "article" || material.targetType === "project_item"
      ? formatWords(material.words)
      : "";
  return [material.meta, words].filter(Boolean).join(" · ");
}

const CREATED_VERB: Record<QuestionLinkTargetType, string> = {
  card: "写下卡片",
  article: "写了文章",
  project_item: "写了项目文档",
  project: "新建项目",
  white_board: "画了白板",
  answer: "写下结论",
};

export interface EventView {
  /** 视觉档：自动事件轻、手动记录重 */
  tone: "start" | "made" | "plain" | "muted" | "done" | "note";
  verb: string;
  targetType?: QuestionLinkTargetType;
  title?: string;
  text?: string;
  estimated: boolean;
}

export function describeEvent(event: QuestionEvent): EventView {
  const p = event.payload as {
    to?: QuestionStatus;
    auto?: boolean;
    created?: boolean;
    targetType?: QuestionLinkTargetType;
    title?: string;
    text?: string;
    estimated?: boolean;
  };
  const estimated = Boolean(p.estimated);
  switch (event.type) {
    case "create":
      return { tone: "start", verb: "提出问题", estimated };
    case "status":
      if (p.to === "resolved") return { tone: "done", verb: "标为已解答", estimated };
      return {
        tone: "plain",
        verb: p.auto
          ? "挂上第一份材料，进入探究中"
          : `改为「${p.to ? STATUS_META[p.to].label : "未知状态"}」`,
        estimated,
      };
    case "link": {
      const type = p.targetType ?? "card";
      return {
        tone: p.created ? "made" : "plain",
        verb: p.created ? CREATED_VERB[type] : `关联${TARGET_META[type]?.label ?? "材料"}`,
        targetType: type,
        title: p.title,
        estimated,
      };
    }
    case "unlink":
      return {
        tone: "muted",
        verb: `移除${TARGET_META[p.targetType ?? "card"]?.label ?? "材料"}`,
        targetType: p.targetType,
        title: p.title,
        estimated,
      };
    case "note":
      return { tone: "note", verb: "", text: p.text ?? "", estimated };
  }
}

/** 「第 N 天 · M 份材料 · K 条记录」/ 已解答为「用时 N 天」 */
export function trajectoryStats(
  question: { status: QuestionStatus; createTime: number; resolvedTime?: number | null },
  materials: number,
  events: QuestionEvent[],
  now: number
): string {
  const days = daySpan(question.createTime, question.resolvedTime ?? now);
  const notes = events.filter(e => e.type === "note").length;
  const head = question.status === "resolved" ? `用时 ${days} 天` : `第 ${days} 天`;
  return `${head} · ${materials} 份材料 · ${notes} 条记录`;
}
