import type { MessageContent } from "./llm";

export type { ToolCallPayload } from "@tau/shared";

export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface ToolFunctionSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolJsonSchema;
  };
}

export interface ToolJsonSchema {
  type: "object";
  description?: string;
  properties: Record<string, ToolParameterSchema>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface ToolExecutionResult {
  content: string;
  modelContent?: MessageContent[];
  reasoning?: string;
  metadata?: Record<string, unknown>;
  /** 标记此结果是否为参数错误（由 toolRegistry 统一判定） */
  isParameterError?: boolean;
  /** 标记此结果是否为用户或父级信号取消 */
  isCancelled?: boolean;
}

export interface ToolExecutionFlags {
  forceReview?: boolean;
  feedbackProposalId?: string;
}

export interface ToolExecutionMetadata {
  flags?: ToolExecutionFlags;
}

export interface ToolExecutionContext {
  databaseName?: string;
  toolCallId: string;
  toolName: string;
  source: string;
  conversationKey?: string;
  signal?: AbortSignal;
  toolContext?: ToolExecutionMetadata;
}

export interface ToolExecutionPolicy {
  timeoutMs?: number | null;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  context?: ToolExecutionContext
) => Promise<ToolExecutionResult | string | null | undefined>;

/** 工具风险级别，决定工具权限模式下是否需要用户确认（见 services/tool-permission） */
export type ToolRisk = "read" | "write" | "execute";

export interface ToolDefinition {
  executionIdentity?: string;
  name: string;
  description: string;
  parameters: ToolJsonSchema;
  execution?: ToolExecutionPolicy;
  /** 缺省按 execute 审批，只读工具须显式声明 */
  risk?: ToolRisk;
  executor: ToolExecutor;
}
