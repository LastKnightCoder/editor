import type { WalkLocale, WalkMessageKey } from "./messages";
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

const WALK_KIND_META: Record<WalkRefKind, { label: WalkMessageKey; icon: LucideIcon }> = {
  card: { label: "kind.card", icon: StickyNote },
  article: { label: "kind.article", icon: FileText },
  "diary-moment": { label: "kind.diary-moment", icon: NotebookPen },
  "project-item": { label: "kind.project-item", icon: FolderKanban },
  "pdf-annotation": { label: "kind.pdf-annotation", icon: BookMarked },
  "plugin-entity": { label: "kind.plugin-entity", icon: Puzzle },
};

const WALK_RELATION_META: Record<WalkRelation, { label: WalkMessageKey; icon: LucideIcon }> = {
  link: { label: "relation.link", icon: Link2 },
  semantic: { label: "relation.semantic", icon: Sparkles },
  tag: { label: "relation.tag", icon: Hash },
};

export function walkKindMeta(kind: WalkRefKind, t: WalkLocale["t"]) {
  const meta = WALK_KIND_META[kind];
  return { ...meta, label: t(meta.label) };
}
export function walkRelationMeta(relation: WalkRelation, t: WalkLocale["t"]) {
  const meta = WALK_RELATION_META[relation];
  return { ...meta, label: t(meta.label) };
}

/** 「为什么是它」行的图标 + 文案 */
export interface WalkWhy {
  icon: LucideIcon;
  text: string;
}

const clipTitle = (title: string, max = 16) =>
  title.length > max ? `${title.slice(0, max)}…` : title;

/** 久未见天数的展示文案 */
export function formatStaleDays(days: number, { t, locale }: WalkLocale): string {
  const number = new Intl.NumberFormat(locale);
  if (days <= 0) return t("reason.recent");
  if (days < 30) return t("reason.days", { count: days, value: number.format(days) });
  if (days < 365)
    return t("reason.months", {
      count: Math.floor(days / 30),
      value: number.format(Math.floor(days / 30)),
    });
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0
    ? t("reason.yearsMonths", { years: number.format(years), months: number.format(months) })
    : t("reason.years", { count: years, value: number.format(years) });
}

export function formatWalkWhy(step: WalkStep, language: WalkLocale): WalkWhy {
  const { t, locale } = language;
  const number = new Intl.NumberFormat(locale);
  const { via, item } = step;
  if (via.type === "relation") {
    const relation = walkRelationMeta(via.relation, t);
    const through =
      via.relation === "tag" && via.sharedTag
        ? t("reason.tag", { tag: via.sharedTag })
        : relation.label;
    return {
      icon: relation.icon,
      text: t("reason.from", { from: clipTitle(via.fromTitle), through }),
    };
  }
  switch (item.reason.type) {
    case "stale":
      return { icon: Clock3, text: formatStaleDays(item.reason.days, language) };
    case "on-this-day":
      return {
        icon: CalendarHeart,
        text: t("reason.anniversary", {
          count: item.reason.years,
          value: number.format(item.reason.years),
        }),
      };
    default:
      return { icon: Shuffle, text: t("reason.random") };
  }
}
