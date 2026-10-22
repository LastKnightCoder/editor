/**
 * 正文的 AI 洞见（主库 content_ai_insights 的 result，content-insights:* 的返回）：
 * 用户点「AI 洞见」时一次生成，标记画在正文的原文片段上，处理状态随库同步。
 */

import type { EntityRef } from "@/entity/ref";

/** 可连接 / 重复 / 矛盾 / 可以展开（空白） */
export type InsightKind = "link" | "dup" | "conflict" | "gap";

/** 未处理 / 已处理（连接、写成卡片、去补写、聊过）/ 不相关 */
export type InsightStatus = "open" | "linked" | "dismissed";

export interface InsightTarget {
  ref: EntityRef;
  contentId: number;
  title: string;
  /** 对方命中的节的标题路径；整篇一节时为空 */
  heading: string;
  /** 打开到对方那一节的顶层块序号 */
  block: number;
  /** 对方命中处的原文片段（预览用） */
  excerpt: string;
}

export interface InsightMark {
  /** 结果内唯一，状态更新用 */
  id: string;
  kind: InsightKind;
  /** 落在本文的哪个顶层块 */
  block: number;
  /** 本文里的原文片段（可以展开为空，标在 block 末尾） */
  anchor: string;
  /** 一句话：可连接 / 重复 / 矛盾时说明关系，可以展开时是可以补写的内容 */
  text: string;
  /** 气泡里的理由 */
  why: string;
  target?: InsightTarget;
  /** 重复与矛盾：双方各一句，并排显示 */
  mine?: string;
  theirs?: string;
  /** 对方来自调用方指定的候选（创作模式白板上的资料） */
  seeded?: boolean;
  status: InsightStatus;
}

export interface InsightAsk {
  id: string;
  text: string;
  status: InsightStatus;
}

export interface ContentInsightsResult {
  lead: string;
  marks: InsightMark[];
  asks: InsightAsk[];
  /** 本地找到的候选数（报告底部「读了 N 份候选」） */
  candidates: number;
}

export interface ContentInsights {
  contentId: number;
  result: ContentInsightsResult;
  model: string;
  analyzedAt: number;
  /** 正文在分析之后改动较大（指纹相似度低于重算阈值） */
  stale: boolean;
}

/** 分析过程推给渲染端的阶段（content-insights:phase） */
export type ContentInsightsPhase =
  | { contentId: number; phase: "candidates"; candidates: number; notes: number }
  | { contentId: number; phase: "thinking" };
