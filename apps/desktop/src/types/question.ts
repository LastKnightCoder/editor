import { Descendant } from "slate";

export interface IQuestion {
  id: number;
  createTime: number;
  updateTime: number;
  questionContent: string;
  description?: Descendant[];
  answers: number[];
  groupId: number;
  sortIndex: number;
  resolvedTime?: number | null;
  status: "not_started" | "in_progress" | "resolved";
}

export interface IAnswer {
  createTime: number;
  updateTime: number;
  id: number;
  content: Descendant[];
}

export interface ICreateAnswer {
  contentId: number;
  content: Descendant[];
}

export type QuestionStatus = IQuestion["status"];

/** 探究材料类型：answer 的 targetId 为 contents.id，其余为各实体表主键 */
export type QuestionLinkTargetType =
  "card" | "article" | "project_item" | "project" | "white_board" | "answer";

export interface QuestionLinkTarget {
  targetType: QuestionLinkTargetType;
  targetId: number;
}

export interface QuestionLink extends QuestionLinkTarget {
  id: number;
  questionId: number;
  sortIndex: number;
  createTime: number;
}

/** 材料的展示投影（主进程统一解析；目标被删时 missing = true） */
export interface QuestionMaterial extends QuestionLink {
  title: string;
  excerpt: string;
  /** 附加元信息，如「3 篇文档」「2 页」「4.2k 字」 */
  meta: string;
  words: number;
  /** 材料本身的创建时间（区别于关联时间 createTime） */
  targetCreateTime: number;
  /** 卡片 / 文章 / 项目文档 / 独立答案背后的 content id */
  contentId: number | null;
  /** 项目文档所属项目，用于页内导航 */
  projectId: number | null;
  missing: boolean;
}

export type QuestionEventType = "create" | "status" | "link" | "unlink" | "note";

export type QuestionEventPayload =
  | { estimated?: boolean }
  | { to: QuestionStatus; auto?: boolean; estimated?: boolean }
  | (QuestionLinkTarget & { created?: boolean; title?: string; estimated?: boolean })
  | { text: string };

export interface QuestionEvent {
  id: number;
  questionId: number;
  type: QuestionEventType;
  payload: QuestionEventPayload;
  createTime: number;
}

export interface QuestionDetail {
  question: IQuestion;
  materials: QuestionMaterial[];
  events: QuestionEvent[];
}

/** 列表行摘要：各类材料数 + 最近一次事件时间 */
export interface QuestionSummary extends IQuestion {
  linkCounts: Partial<Record<QuestionLinkTargetType, number>>;
  lastActivityTime: number;
}

/** 首页「探究中的问题」行 */
export interface ActiveQuestionPreview extends QuestionSummary {
  groupTitle: string;
  groupColor?: string;
  lastEvent: QuestionEvent | null;
  lastEventTitle: string | null;
}
