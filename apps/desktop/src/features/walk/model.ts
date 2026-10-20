/**
 * 漫步页的展示元信息与文案：类型 / 关系图标标签、「为什么是它」与久未见天数的说法。
 */

import {
  BookMarked,
  CalendarHeart,
  Clock3,
  FileText,
  FolderKanban,
  Hash,
  Link2,
  NotebookPen,
  Shuffle,
  Sparkles,
  StickyNote,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import type { WalkRefKind, WalkRelation } from "@/types";
import type { WalkStep } from "./trail";

/** 五种类型的固定展示顺序（偏好面板与解析 from 参数共用） */
export const WALK_KIND_ORDER: WalkRefKind[] = [
  "card",
  "article",
  "diary-moment",
  "project-item",
  "pdf-annotation",
];

export const WALK_KIND_META: Record<WalkRefKind, { label: string; icon: LucideIcon }> = {
  card: { label: "卡片", icon: StickyNote },
  article: { label: "文章", icon: FileText },
  "diary-moment": { label: "日记", icon: NotebookPen },
  "project-item": { label: "项目文档", icon: FolderKanban },
  "pdf-annotation": { label: "PDF 批注", icon: BookMarked },
  "plugin-entity": { label: "插件内容", icon: Puzzle },
};

export const WALK_RELATION_META: Record<WalkRelation, { label: string; icon: LucideIcon }> = {
  link: { label: "双链", icon: Link2 },
  semantic: { label: "语义相近", icon: Sparkles },
  tag: { label: "标签", icon: Hash },
};

/** 「为什么是它」行的图标 + 文案 */
export interface WalkWhy {
  icon: LucideIcon;
  text: string;
}

const clipTitle = (title: string, max = 16) =>
  title.length > max ? `${title.slice(0, max)}…` : title;

/** 久未见天数的中文说法 */
export function formatStaleDays(days: number): string {
  if (days <= 0) return "最近刚见过";
  if (days < 30) return `${days} 天没见过它了`;
  if (days < 365) return `${Math.floor(days / 30)} 个月没见过它了`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years} 年零 ${months} 个月没见过它了` : `${years} 年没见过它了`;
}

export function formatWalkWhy(step: WalkStep): WalkWhy {
  const { via, item } = step;
  if (via.type === "relation") {
    const relation = WALK_RELATION_META[via.relation];
    const through =
      via.relation === "tag" && via.sharedTag ? `标签 #${via.sharedTag}` : relation.label;
    return { icon: relation.icon, text: `从「${clipTitle(via.fromTitle)}」经${through}走来` };
  }
  switch (item.reason.type) {
    case "stale":
      return { icon: Clock3, text: formatStaleDays(item.reason.days) };
    case "on-this-day":
      return { icon: CalendarHeart, text: `那年今日 · ${item.reason.years} 年前的今天` };
    default:
      return { icon: Shuffle, text: "随手抽到的" };
  }
}
