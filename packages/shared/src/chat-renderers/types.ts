/**
 * 聊天组件通用类型定义。
 * ToolCallPayload / ToolCallExecutionState / ContentBlock 系列已统一收敛到 chat-core/messages.ts，
 * 此处仅 re-export 供既有消费方使用；ChatMessageType 为浏览器插件旧消息模型（迁移期兼容）。
 */
import type {
  ContentBlock,
  Role,
  ToolCallExecutionState,
  ToolCallPayload,
} from "../chat-core/messages.ts";

export type {
  ToolCallStatus,
  ToolCallExecutionState,
  ToolCallPayload,
  ContentBlock,
} from "../chat-core/messages.ts";

export type ContentBlockType = "text" | "reasoning" | "tool_calls";

/** 文本内容块 */
export interface TextContentBlock {
  type: "text";
  content: string;
}

/** 推理内容块 */
export interface ReasoningContentBlock {
  type: "reasoning";
  content: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

/** 工具调用内容块 */
export interface ToolCallsContentBlock {
  type: "tool_calls";
  executions: ToolCallExecutionState[];
}

/** 消息角色 */
export type MessageRole = `${Role}`;

/** 聊天消息（旧模型：浏览器插件存量数据结构） */
export interface ChatMessageType {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  reasoning?: string;
  contentBlocks?: ContentBlock[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
  /** 对应的 pi 会话 entry id（从桌面会话文件投影而来的消息才有），改历史操作按它定位 */
  piEntryIds?: string[];
  /** 会话树上同一位置的全部版本（用户消息，有多个版本时才有），‹ i/n › 切换 */
  piVersions?: { ids: string[]; index: number };
}

/**
 * 历史导出别名：ChatMessage 曾以本名导出，消费方（浏览器插件等）仍以 ChatMessage 引用。
 */
export type ChatMessage = ChatMessageType;
