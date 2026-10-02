import { Descendant } from "slate";
import type { MaterialInfo, MaterialKind } from "@/entity/material";
import type { EntityRef } from "@/entity/ref";

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

/** 探究材料类型：answer 的 targetId 为 contents.id，其余为各实体表主键；外部材料复用 MaterialKind */
export type QuestionLinkTargetType =
  "card" | "article" | "project_item" | "project" | "white_board" | "answer" | MaterialKind;

/** 材料构成与轨迹里出现的类型：探究材料 + 探究对话（对话存 question_chat，不在 question_link） */
export type QuestionCompositionKind = QuestionLinkTargetType | "chat-session";

export interface QuestionLinkTarget {
  anchor?: import("@/entity/quote-anchor").QuoteAnchor;
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
  anchorLost?: boolean;
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
  /** 白板当前画板（whiteboard-content 页的参数） */
  boardContentId: number | null;
  missing: boolean;
  /** 外部材料（摘录 / PDF 标注 / 剪藏）的展示与打开信息；摘录源端删除时 deleted = true */
  material?: MaterialInfo;
  /** 独立答案的正文已被「创建为」卡片 / 文章 / 项目文档时，共用正文的那些身份 */
  projections?: EntityRef[];
}

/** 问题的探究对话（question_chat 行 + chat_session 的展示信息） */
export interface QuestionChat {
  id: number;
  questionId: number;
  sessionId: string;
  /** 问题从哪几条消息转来（pi entry id）；手动关联的为空 */
  messageIds: string[];
  createTime: number;
  title: string;
  /** 对话场景标签：主对话为空，其余如「PDF 对话」 */
  scopeLabel: string;
  messageCount: number;
  updateTime: number;
  /** 只有主对话能经对话页打开 */
  openable: boolean;
  /** 对话已删除 */
  missing: boolean;
  /** 从这个问题发起（谱系 discussed_in） */
  initiated: boolean;
}

export interface QuestionChatTarget {
  sessionId: string;
  messageIds?: string[];
}

export type QuestionEventType = "create" | "status" | "link" | "unlink" | "note";

export type QuestionEventPayload =
  | { estimated?: boolean }
  | { to: QuestionStatus; auto?: boolean; estimated?: boolean }
  | (QuestionLinkTarget & { created?: boolean; title?: string; estimated?: boolean })
  | { targetType: "chat-session"; sessionId: string; title?: string }
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
  chats: QuestionChat[];
  events: QuestionEvent[];
  /** 已立项的 Notebook（谱系 upgraded_to）；Notebook 被删后为 null */
  notebook: { id: number; title: string } | null;
}

/** 列表行摘要：各类材料数 + 最近一次事件时间 */
export interface QuestionSummary extends IQuestion {
  linkCounts: Partial<Record<QuestionCompositionKind, number>>;
  lastActivityTime: number;
}

/** 首页「探究中的问题」行 */
export interface ActiveQuestionPreview extends QuestionSummary {
  groupTitle: string;
  groupColor?: string;
  lastEvent: QuestionEvent | null;
  lastEventTitle: string | null;
}
