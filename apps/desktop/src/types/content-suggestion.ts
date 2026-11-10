import type { ScopedContentBaseline, ScopedContentEdit } from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";

/** 主进程广播的建议变更频道：载荷为 ContentSuggestionsChange */
export const CONTENT_SUGGESTIONS_CHANGED = "content-suggestions:changed";
/** 独立窗口发起、转给主窗口处理的跟进请求（让 Agent 接着做） */
export const CONTENT_SUGGESTION_FOLLOW_UP = "content-suggestions:follow-up";
/** Agent 在某篇正文上的权限变化：载荷为 ContentAgentPermissionsChange */
export const CONTENT_AGENT_PERMISSIONS_CHANGED = "content-agent-permissions:changed";

/**
 * pending 待处理；applying 已提交但结果未确认（可按原身份重送）；
 * accepted / rejected / undone 为用户处理结果；answered 为提问已作答；
 * expired 原文已变或提交被拒绝；superseded 被同对话的新提案替换。
 */
export type ContentSuggestionStatus =
  | "pending"
  | "applying"
  | "accepted"
  | "rejected"
  | "answered"
  | "expired"
  | "superseded"
  | "undone";

/** edit 为改动；question 为锚在原文上的提问，作答结果记在 feedback */
export type ContentSuggestionKind = "edit" | "question";
/** suggest 等用户接受；direct 为有直接改权限时实时落地的记录，事后可撤销 */
export type ContentSuggestionMode = "suggest" | "direct";

/** Agent × 正文的三档权限；没有记录即 suggest */
export type AgentPermissionLevel = "readonly" | "suggest" | "direct";

export interface ContentSuggestionItem {
  edit: ScopedContentEdit;
  beforeText: string;
  afterText: string;
  /** Agent 给的一句理由与出处 */
  reason?: string;
}

export interface ContentSuggestionBatch {
  proposalId: string;
  conversationKey: string;
  agentId?: string;
  agentLabel?: string;
  mode?: ContentSuggestionMode;
  baseline: ScopedContentBaseline;
  contracts?: ContentContractDictionary;
  items: ContentSuggestionItem[];
}

/** 一条锚在原文上的提问；锚点是不改动正文的范围编辑（预期与替换相同） */
export interface ContentQuestionRequest {
  proposalId: string;
  conversationKey: string;
  agentId?: string;
  agentLabel?: string;
  baseline: ScopedContentBaseline;
  anchor: ScopedContentEdit;
  quote: string;
  question: string;
  options: string[];
}

export interface ContentSuggestion extends ScopedContentBaseline {
  id: string;
  contentId: number;
  proposalId: string;
  conversationKey: string;
  agentId?: string;
  agentLabel?: string;
  sequence: number;
  kind: ContentSuggestionKind;
  mode: ContentSuggestionMode;
  edit: ScopedContentEdit;
  /** 接受后新文字所在的范围（逆操作的锚点），用于正文标出刚改过的位置 */
  applied?: ScopedContentEdit;
  beforeText: string;
  afterText: string;
  reason?: string;
  /** 提问的可选答案 */
  options?: string[];
  status: ContentSuggestionStatus;
  /** 退回时的意见，或提问的回答 */
  feedback?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContentSuggestionsChange {
  databaseName: string;
  contentId: number;
  proposalIds: string[];
}

export interface ContentSuggestionQuery {
  contentId?: number;
  proposalId?: string;
  suggestionId?: string;
}

export interface ContentSuggestionAcceptOptions {
  typing?: boolean;
  requireDirectPermission?: boolean;
  executionId?: string;
}

export interface ContentAgentPermission {
  agent: string;
  level: AgentPermissionLevel;
  updatedAt: number;
}

export interface ContentAgentPermissionsChange {
  databaseName: string;
  contentId: number;
}

/** 已处理（接受 / 退回 / 撤销 / 作答）的条目在正文视图里保留的时长：「本次协作」回看与撤销 */
export const SUGGESTION_HISTORY_MS = 24 * 60 * 60 * 1000;
