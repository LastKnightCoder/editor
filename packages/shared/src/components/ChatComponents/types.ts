/**
 * 聊天组件通用类型定义
 */

/** 工具调用执行状态 */
export type ToolCallStatus =
  | "pending"
  | "executing"
  | "success"
  | "failed"
  | "retrying";

/** 工具调用执行状态详情 */
export interface ToolCallExecutionState {
  toolCallId: string;
  toolName: string;
  status: ToolCallStatus;
  input: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  duration?: number;
  /** 错误类型：parameter 参数错误，execution 执行错误 */
  errorType?: "parameter" | "execution";
  /** 首次进入 pending 的时间戳 */
  timestamp?: number;
  retryCount?: number;
}

export interface ToolCallPayload {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** 内容块类型 */
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

/** 内容块联合类型 */
export type ContentBlock =
  | TextContentBlock
  | ReasoningContentBlock
  | ToolCallsContentBlock;

/** 消息角色 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  reasoning?: string;
  contentBlocks?: ContentBlock[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
}
