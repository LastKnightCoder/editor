import type { ChatSessionSource, MessageContent, ThinkingLevel } from "@tau/shared/chat-core";

export type AiErrorCode =
  | "AI_SESSION_BUSY"
  | "AI_SESSION_NOT_FOUND"
  | "AI_SESSION_REVISION_CONFLICT"
  | "AI_SESSION_FILE_MISSING"
  | "AI_SESSION_FORMAT_UNSUPPORTED"
  | "AI_SESSION_INVALID"
  | "AI_LIBRARY_CHANGED"
  | "AI_LIBRARY_BUSY"
  | "AI_MODEL_UNAVAILABLE"
  | "AI_MODEL_METADATA_INCOMPLETE"
  | "AI_INTERACTION_UNAVAILABLE"
  | "AI_TOOL_UNAVAILABLE"
  | "AI_TOOL_ARGUMENT_INVALID"
  | "AI_TOOL_DENIED"
  | "AI_TOOL_OUTCOME_UNKNOWN"
  | "AI_RUN_ID_CONFLICT"
  | "AI_RUN_LIMIT"
  | "AI_ATTACHMENT_UNAVAILABLE"
  | "AI_SKILL_UNAVAILABLE"
  | "AI_SKILL_INVALID"
  | "AI_SKILL_RESOURCE_INVALID"
  | "AI_SKILL_SCRIPT_UNSUPPORTED"
  | "AI_MCP_UNSUPPORTED_TRANSPORT"
  | "AI_MCP_CONNECTION_FAILED"
  | "AI_STORAGE_FAILED"
  | "AI_TRANSPORT_FAILED";

export class AiError extends Error {
  readonly name = "AiError";

  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryable = false,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export interface AiSessionRef {
  databaseName: string;
  sessionId: string;
}

export interface AiModelRef {
  providerId: string;
  modelId: string;
}

export type AiRunStatus =
  | "preparing"
  | "running"
  | "waiting-approval"
  | "waiting-answer"
  | "stopping"
  | "settled";
export type AiRunOutcome = "completed" | "failed" | "aborted" | "interrupted";
export type AiInteractionMode = "none" | "host";
export type AiSessionSource = ChatSessionSource;
export type AiToolRisk = "read" | "write" | "execute";

export interface AiSessionRow {
  id: string;
  scope: string;
  domainRef: string | null;
  sessionFile: string;
  cwd: string;
  title: string;
  titleDirty: boolean;
  groupId: number | null;
  orderNum: number | null;
  archived: boolean;
  source: AiSessionSource;
  messageCount: number;
  createTime: number;
  updateTime: number;
}

export interface AiToolSpec {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: AiToolRisk;
  sourceId: string;
  executionIdentity: string;
}

export interface AiToolExecutionContext {
  session: AiSessionRef;
  runId: string;
  executionId: string;
  toolCallId: string;
  signal: AbortSignal;
  operationId: string;
}

export interface AiToolResult {
  content: string;
  modelContent?: string;
  metadata?: Record<string, unknown>;
}

export type AiToolExecutor = (
  input: unknown,
  context: AiToolExecutionContext
) => Promise<AiToolResult>;

export interface AiRunStartRequest {
  runId: string;
  session: AiSessionRef;
  expectedRevision: string;
  message: MessageContent[];
  model: AiModelRef;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  temperature?: number;
  toolIds: readonly string[];
  skillIds: readonly string[];
  interactionMode: AiInteractionMode;
}
