/**
 * 随机漫步：从用户已有内容里随机抽一条来重温（非闪卡、无评分）。
 * 渲染端与主进程共用；抽样池为 EntityRef 四种实体 + PDF 批注。
 */

import type { EntityRefKind } from "@/entity/ref";

/** EntityRef 不含 PDF 批注，漫步地址在其上扩展；EntityRef 可直接当 WalkRef 用（kind 为子集） */
export type WalkRefKind = EntityRefKind | "pdf-annotation";

export interface WalkRef {
  kind: WalkRefKind;
  id: number;
}

export type WalkBias = "random" | "stale" | "on-this-day";

/** 选中原因：stale 为距今天数，on-this-day 为年差（往年同月同日） */
export type WalkReason =
  { type: "stale"; days: number } | { type: "on-this-day"; years: number } | { type: "random" };

export interface WalkItem {
  ref: WalkRef;
  /** 卡片无标题：优先 AI 标题，否则正文首行截断 */
  title: string;
  contentId: number | null;
  /** Slate 块（PDF 批注为 null） */
  content: unknown[] | null;
  /** PDF 批注摘录原文；其余 null */
  excerpt: string | null;
  /** PDF 批注用户笔记纯文本；其余 null */
  note: string | null;
  /** PDF 批注为所属文件名 + 页码，项目文档为所属项目名；其余 null */
  source: string | null;
  tags: string[];
  createTime: number;
  updateTime: number;
  lastSeenTime: number | null;
  reason: WalkReason;
}

export interface RandomWalkPickParams {
  bias: WalkBias;
  /** 只在指定类型里抽（缺省 / 空数组 = 全部 5 种） */
  kinds?: WalkRefKind[];
  /** 排除的实体地址（如刚看过的） */
  exclude?: WalkRef[];
}

export interface RandomWalkDailyDeckParams {
  /** 本地日期 YYYY-MM-DD */
  date: string;
}

/** 岔路关系：双链 / 语义相近 / 同标签 */
export type WalkRelation = "link" | "semantic" | "tag";

export interface WalkNeighbor {
  ref: WalkRef;
  title: string;
  relation: WalkRelation;
  /** tag 关系时为命中的第一个共同标签；其余 null */
  sharedTag: string | null;
}

export interface RandomWalkSameTagParams {
  ref: WalkRef;
  tags: string[];
  /** 排除的实体地址（如本次漫步已走过的足迹） */
  exclude?: WalkRef[];
  /** 默认 3，上限 10 */
  limit?: number;
}

export interface RandomWalkDailyAdvanceParams {
  date: string;
  cursor: number;
}

export interface WalkDailyDeck {
  date: string;
  items: WalkItem[];
  cursor: number;
}
