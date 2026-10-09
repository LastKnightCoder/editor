/**
 * 创作模式（左白板右写作）的共享类型：主进程与渲染端共用。
 */

import type { EntityRef } from "@/entity/ref";

/** 一份正文的素材板：一页白板画布，按 contentId 绑定（共用正文的身份共享同一块） */
export interface ComposeBoard {
  contentId: number;
  pageId: number;
  /** 写作意图；跳过时为空 */
  intent: string;
  /** 用户移走的 AI 召集资料（entityRefKey），再找时排除 */
  dismissed: string[];
  createTime: number;
  updateTime: number;
}

export interface ComposeBoardSummary {
  /** 白板上的资料份数（按实体去重） */
  documents: number;
}

/** AI 召集的一份资料 */
export interface GatherItem {
  ref: EntityRef;
  contentId: number;
  title: string;
  /** 为什么相关（提示词要求 ≤ 20 字，硬上限 40） */
  why: string;
  /** 长文命中的节：标题路径与起始块序号 */
  heading: string;
  block: number;
}

export interface GatherGroup {
  name: string;
  items: GatherItem[];
}

export interface GatherResult {
  groups: GatherGroup[];
  /** 本地粗筛出的候选数 */
  candidates: number;
}

export type GatherPhase =
  | { contentId: number; phase: "candidates"; candidates: number; notes: number }
  | { contentId: number; phase: "thinking" };

export interface GatherInput {
  contentId: number;
  /** 意图（召集）；再找一些时同样传当前意图 */
  intent: string;
  /** 排除：白板上已有的实体 key */
  exclude: string[];
  /** 来源类型（EntityRefKind），空为全部 */
  kinds?: string[];
  /** 再找一些：带上正文最近写的内容 */
  more?: boolean;
}
