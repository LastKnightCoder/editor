/**
 * 主题与全局层的 AI 洞见、项目回顾（主库 knowledge_ai_insights 的 result，knowledge-insights:* 的返回）。
 *
 * 后台按知识地图的子主题 → 主题 → 全局分层生成（只读 7a 元信息），项目回顾按归档与变化量生成。
 * 标记画在知识地图或项目树上，产出只有连接与问题；处理状态随库同步。
 */

import type { EntityRef } from "@/entity/ref";
import type { InsightAsk, InsightStatus } from "./content-insights";

export type KnowledgeInsightScope = "subtopic" | "topic" | "global" | "project";

/**
 * 呼应（主题间）/ 问了但没写 / 重复 / 矛盾 / 缺一环 / 同一思路 / 还缺（空白）/
 * 可能属于这里（项目）/ 还薄（项目）
 */
export type KnowledgeMarkKind =
  "bridge" | "asked" | "dup" | "conflict" | "chain" | "pattern" | "gap" | "belong" | "thin";

/** 标记涉及的一份笔记 */
export interface KnowledgeEndpoint {
  ref: EntityRef;
  contentId: number;
  title: string;
  /** 所属主题「主题 › 子主题」（呼应时两端不同） */
  topic: string;
  /** 命中节的标题路径；整篇一节时为空 */
  heading: string;
  /** 命中节的顶层块序号（打开到位置） */
  block: number;
  /** 预览用的要点或命中处文字 */
  excerpt: string;
  /** 长文一端的原文片段（逐字校验过）：「去连接」时在那篇里画这一处 */
  anchor?: string;
}

/** 问了但没写：用户在主对话里问过的一次 */
export interface AskedPrompt {
  sessionId: string;
  messageId: string;
  text: string;
  time: number;
}

export interface KnowledgeMark {
  /** 结果内唯一，状态更新用 */
  id: string;
  kind: KnowledgeMarkKind;
  /** 气泡里的理由 */
  why: string;
  /**
   * 涉及的笔记：呼应 / 重复 / 矛盾两端；缺一环按链的顺序；同一思路为用到它的几处；
   * 可能属于这里为那一份。问了没写、还缺、还薄为空。
   */
  ends: KnowledgeEndpoint[];
  /** 矛盾：两端各一句主张，并排显示 */
  claims?: [string, string];
  /** 缺一环：空位插在 ends 的第几个之前，以及缺的是什么 */
  missing?: { index: number; text: string };
  /** 还缺 / 还薄的说法；问了没写为整理出的问题；同一思路为这种思路的名字 */
  text?: string;
  /** 问了但没写：问过的几次（最近的在前） */
  prompts?: AskedPrompt[];
  /** 问了但没写：它该属于的主题（地图上画在这个主题边上），找不到时为空 */
  topicLabel?: string;
  /** 项目回顾：落在项目树哪一支（项目条目 id） */
  under?: number;
  status: InsightStatus;
}

export interface KnowledgeInsightResult {
  /** 报告卡的两三句 */
  lead: string;
  marks: KnowledgeMark[];
  asks: InsightAsk[];
  /** 生长条：每季度新写的笔记数（最早到最近） */
  growth: number[];
  /** 本地候选数（报告底部说明用） */
  candidates: number;
  /** 不相关过的标记身份：以后重新生成也不再出现 */
  dismissed: string[];
  /** 结项回顾：最能代表核心观点的文档 */
  refs?: KnowledgeEndpoint[];
  /** 结项回顾：结论适合归入的进行中项目 */
  home?: { projectId: number; title: string };
  /** 项目回顾：和项目外笔记已有的连接数（小关系图） */
  outside?: number;
  /** 用户看过这份结果的时间（打开回顾、今日卡点「知道了」）；重新生成后清空 */
  seenAt?: number;
}

/** 给上一层读的部分 */
export interface KnowledgeOverview {
  overview: string;
  /** 关注点的变化（子主题、主题），可空 */
  shift: string;
  /** 项目回顾的种类：生长回顾 / 结项回顾 */
  kind?: "growth" | "final";
}

/** 一个主题层级（或全局 / 项目回顾）的结果 */
export interface KnowledgeInsightNode {
  id: number;
  scope: KnowledgeInsightScope;
  parentId: number | null;
  projectId: number | null;
  /** 生成时的主题名（项目回顾为项目名） */
  label: string;
  /** 当前知识地图上的主题 id（对得上时）；全局与项目为 null */
  topicId: number | null;
  /** 项目回顾的种类 */
  reviewKind?: "growth" | "final";
  result: KnowledgeInsightResult;
  model: string;
  updateTime: number;
}

/** 分析过程推给渲染端的阶段（knowledge-insights:phase） */
export type KnowledgeInsightsPhase =
  | { phase: "reading"; topics: number; stale: number; notes: number }
  | { phase: "thinking" }
  | { phase: "done" };

/** knowledge-insights:get / analyze 的返回 */
export interface KnowledgeInsightsPayload {
  configured: boolean;
  running: boolean;
  /** 地图上的笔记里有元信息的比例 */
  coverage: number;
  global: KnowledgeInsightNode | null;
  topics: KnowledgeInsightNode[];
  /** 项目回顾（生长 / 结项）；kind 见 reviewKind */
  projects: KnowledgeInsightNode[];
}
