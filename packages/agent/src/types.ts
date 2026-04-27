export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentTextContent {
  type: "text";
  text: string;
}

export type AgentMessageContent = AgentTextContent | object;

export interface AgentToolCall {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments?: string;
  };
}

export interface AgentToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function: {
    name?: string;
    arguments?: string;
  };
}

export interface AgentMessage {
  role: AgentRole | string;
  content: AgentMessageContent[] | string;
  reasoning_content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AgentToolCall[];
}

export interface AgentToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: AgentToolParameterSchema;
  properties?: Record<string, AgentToolParameterSchema>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface AgentToolJsonSchema {
  type: "object";
  description?: string;
  properties: Record<string, AgentToolParameterSchema>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface AgentToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: AgentToolJsonSchema;
  };
}

export interface AgentToolExecutionResult {
  content: string;
  reasoning?: string;
  metadata?: Record<string, unknown>;
  isParameterError?: boolean;
  isCancelled?: boolean;
}

export interface AgentToolExecutionState {
  toolCallId: string;
  toolName: string;
  source: string;
  status:
    | "pending"
    | "executing"
    | "success"
    | "failed"
    | "retrying"
    | "cancelled";
  input: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  errorType?: "parameter" | "execution";
  timestamp: number;
  duration?: number;
  retryCount?: number;
}

export interface AgentToolExecutionContext {
  toolCallId: string;
  toolName: string;
  source: string;
  signal?: AbortSignal;
  conversationKey?: string;
  toolContext?: Record<string, unknown>;
}

export interface AgentToolExecutionPolicy {
  timeoutMs?: number | null;
}

export interface AgentTool {
  name: string;
  description: string;
  source: string;
  parameters: AgentToolJsonSchema;
  execution?: AgentToolExecutionPolicy;
  execute: (
    args: Record<string, unknown>,
    context?: AgentToolExecutionContext,
  ) => Promise<AgentToolExecutionResult | string | null | undefined>;
}

export interface AgentSkillFile {
  path: string;
  isDirectory?: boolean;
  content?: string;
}

export interface AgentSkill {
  id?: string;
  folderName: string;
  name: string;
  description: string;
  path?: string;
  readme?: string;
  readmeContent?: string;
  loadReadme?: () => Promise<string>;
  loadTree?: () => Promise<string>;
  readFile?: (relativePath: string) => Promise<string>;
  files?: AgentSkillFile[];
  metadata?: Record<string, unknown>;
  contributors?: AgentMessageContributor[];
  hooks?: AgentRuntimeHook[];
}

export interface AgentToolSource {
  getTools: () => Promise<AgentTool[]> | AgentTool[];
}

export interface AgentNotice {
  level: "warning" | "error";
  code: string;
  message: string;
}

export type AgentTurnResult =
  | {
      type: "response";
      content: string;
      reasoningContent: string;
      finishReason: string | null;
    }
  | {
      type: "tool_calls";
      content: string;
      reasoningContent: string;
      finishReason: "tool_calls";
      toolCalls: AgentToolCall[];
    };

export type AgentModelEvent =
  | {
      type: "text-delta";
      delta: string;
    }
  | {
      type: "reasoning-delta";
      delta: string;
    }
  | {
      type: "tool-calls-delta";
      toolCalls: AgentToolCall[];
    }
  | {
      type: "notice";
      notice: AgentNotice;
    }
  | {
      type: "turn-complete";
      result: AgentTurnResult;
    };

export interface AgentModelTurnRequest {
  messages: AgentMessage[];
  tools?: AgentToolSchema[];
  controller: AbortController;
  signal: AbortSignal;
  traceId: string;
  runId: string;
  turnId: string;
  conversationKey?: string;
  reasoningEffort?: string;
  metadata?: Record<string, unknown>;
  deferAssistantTextUntilFinish?: boolean;
  disableAnimation?: boolean;
}

export interface AgentModelAdapter {
  streamTurn: (
    request: AgentModelTurnRequest,
  ) => AsyncIterable<AgentModelEvent>;
}

export interface AgentModelRawChunk {
  delta?: {
    content?: string;
    reasoning_content?: string;
    tool_calls?: AgentToolCallDelta[];
    [key: string]: unknown;
  };
  finish_reason?: string | null;
}

export interface AgentModelRawChunkParser {
  parse: (text: string) => AgentModelRawChunk | undefined;
  flush?: () => AgentModelRawChunk | undefined;
}

export interface AgentPreparedModelTurn {
  request: AgentModelTurnRequest;
  endpoint: string;
  payload: unknown;
  headers: Record<string, string>;
  parser: AgentModelRawChunkParser;
}

export interface AgentModelProtocolAdapter {
  prepareTurn: (
    request: AgentModelTurnRequest,
  ) => Promise<AgentPreparedModelTurn> | AgentPreparedModelTurn;
}

export interface AgentModelTransport {
  streamPreparedTurn: (
    preparedTurn: AgentPreparedModelTurn,
  ) => AsyncIterable<AgentModelEvent>;
}

export interface AgentPolicies {
  maxToolCallLoops?: number;
  maxToolRetries?: number;
  defaultToolTimeoutMs?: number;
  toolModeFallback?: boolean;
  isTransientToolError?: (error: Error, call: AgentToolCall) => boolean;
  shouldSkipToolTimeout?: (toolName: string) => boolean;
  getToolTimeoutMs?: (toolName: string, defaultTimeoutMs: number) => number;
  retryDelayMs?: (attempt: number, error: Error, call: AgentToolCall) => number;
}

export interface AgentSession {
  id?: string;
  conversationKey?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentObserver {
  onEvent: (event: AgentEvent) => void | Promise<void>;
}

export interface AgentTelemetryRecord {
  name: string;
  attributes?: Record<string, unknown>;
}

export interface AgentTelemetryAPI {
  record: (record: AgentTelemetryRecord) => void | Promise<void>;
}

export interface AgentTraceSpanStart {
  name: string;
  attributes?: Record<string, unknown>;
}

export interface AgentTraceSpan {
  end: (attributes?: Record<string, unknown>) => void | Promise<void>;
}

export interface AgentTracingAPI {
  startSpan: (
    span: AgentTraceSpanStart,
  ) => AgentTraceSpan | Promise<AgentTraceSpan>;
}

export interface AgentRuntimeExtensionsAPI {
  has: (name: string) => boolean;
  get: <T = unknown>(name: string) => T | undefined;
  require: <T = unknown>(name: string) => T;
  list: () => string[];
}

export interface AgentRuntimeConfig {
  telemetry?: AgentTelemetryAPI;
  tracing?: AgentTracingAPI;
  extensions?: Record<string, unknown>;
}

export interface AgentRuntimeAPI {
  telemetry: AgentTelemetryAPI;
  tracing: AgentTracingAPI;
  extensions: AgentRuntimeExtensionsAPI;
}

export interface AgentRunRequest {
  messages: AgentMessage[];
  enableTools?: boolean;
  controller?: AbortController;
  conversationKey?: string;
  toolContext?: Record<string, unknown>;
  reasoningEffort?: string;
  metadata?: Record<string, unknown>;
  deferAssistantTextUntilFinish?: boolean;
  disableAnimation?: boolean;
}

export interface AgentRunResult {
  traceId: string;
  runId: string;
  turnId: string;
  finishReason: string | null;
  content: string;
  reasoningContent: string;
  finalMessage: AgentMessage;
}

export interface AgentErrorPayload {
  name: string;
  message: string;
}

export interface AgentMutableState {
  messages: AgentMessage[];
  toolModeActive: boolean;
  metadata?: Record<string, unknown>;
  reasoningEffort?: string;
}

export interface AgentSystemState {
  traceId: string;
  runId: string;
  turnId?: string;
  sessionId?: string;
  session?: AgentSession;
  conversationKey?: string;
  loopIndex: number;
  request: AgentRunRequest;
  tools: AgentTool[];
  toolSchemas: AgentToolSchema[];
}

export interface AgentHookBaseContext {
  system: AgentSystemState;
  state: AgentMutableState;
  runtime: AgentRuntimeAPI;
  publishNotice: (notice: AgentNotice) => void;
}

export interface AgentMessageContributor {
  id: string;
  order?: number;
  stage?: "run-init" | "before-turn";
  contribute: (context: AgentHookBaseContext) => void | Promise<void>;
}

export interface AgentBeforeTurnHookContext extends AgentHookBaseContext {
  turnId: string;
}

export interface AgentAfterModelTurnHookContext extends AgentHookBaseContext {
  turnId: string;
  result: AgentTurnResult;
  streamedToolCalls: AgentToolCall[];
}

export interface AgentBeforeToolCallHookContext extends AgentHookBaseContext {
  turnId: string;
  call: AgentToolCall;
  execution: AgentToolExecutionState;
  executions: AgentToolExecutionState[];
}

export interface AgentAfterToolCallHookContext extends AgentHookBaseContext {
  turnId: string;
  call: AgentToolCall;
  execution: AgentToolExecutionState;
  executions: AgentToolExecutionState[];
}

export interface AgentRunFinishHookContext extends AgentHookBaseContext {
  turnId: string;
  result: AgentRunResult;
}

export interface AgentRunErrorHookContext extends AgentHookBaseContext {
  turnId?: string;
  error: AgentErrorPayload;
}

export interface AgentRuntimeHook {
  id: string;
  order?: number;
  onRunInit?: (context: AgentHookBaseContext) => void | Promise<void>;
  onBeforeTurn?: (context: AgentBeforeTurnHookContext) => void | Promise<void>;
  onAfterModelTurn?: (
    context: AgentAfterModelTurnHookContext,
  ) => void | Promise<void>;
  onBeforeToolCall?: (
    context: AgentBeforeToolCallHookContext,
  ) => void | Promise<void>;
  onAfterToolCall?: (
    context: AgentAfterToolCallHookContext,
  ) => void | Promise<void>;
  onRunFinish?: (context: AgentRunFinishHookContext) => void | Promise<void>;
  onRunError?: (context: AgentRunErrorHookContext) => void | Promise<void>;
}

interface AgentBaseEvent {
  traceId: string;
  runId: string;
  turnId?: string;
  sessionId?: string;
  conversationKey?: string;
  timestamp: number;
}

export type AgentEvent =
  | (AgentBaseEvent & {
      type: "run-start";
    })
  | (AgentBaseEvent & {
      type: "turn-start";
      turnId: string;
      toolModeActive: boolean;
      loopIndex: number;
    })
  | (AgentBaseEvent & {
      type: "text-delta";
      turnId: string;
      delta: string;
      text: string;
      reasoningContent: string;
    })
  | (AgentBaseEvent & {
      type: "reasoning-delta";
      turnId: string;
      delta: string;
      reasoningContent: string;
    })
  | (AgentBaseEvent & {
      type: "tool-call-planned";
      turnId: string;
      phase: "streaming" | "preview";
      toolCalls: AgentToolCall[];
    })
  | (AgentBaseEvent & {
      type: "tool-call-started";
      turnId: string;
      toolCalls: AgentToolCall[];
      execution: AgentToolExecutionState;
      executions: AgentToolExecutionState[];
    })
  | (AgentBaseEvent & {
      type: "tool-call-updated";
      turnId: string;
      toolCalls: AgentToolCall[];
      execution: AgentToolExecutionState;
      executions: AgentToolExecutionState[];
    })
  | (AgentBaseEvent & {
      type: "tool-call-finished";
      turnId: string;
      toolCalls: AgentToolCall[];
      execution: AgentToolExecutionState;
      executions: AgentToolExecutionState[];
    })
  | (AgentBaseEvent & {
      type: "notice";
      turnId?: string;
      notice: AgentNotice;
    })
  | (AgentBaseEvent & {
      type: "turn-finished";
      turnId: string;
      finishReason: string | null;
      resultType: "response" | "tool_calls";
      content: string;
      reasoningContent: string;
      toolCalls?: AgentToolCall[];
    })
  | (AgentBaseEvent & {
      type: "run-finished";
      turnId: string;
      finishReason: string | null;
      content: string;
      reasoningContent: string;
      finalMessage: AgentMessage;
    })
  | (AgentBaseEvent & {
      type: "run-error";
      turnId?: string;
      error: AgentErrorPayload;
    });

export interface AgentConfig {
  model: AgentModelAdapter;
  tools?: AgentTool[] | AgentToolSource;
  skills?: AgentSkill[];
  contributors?: AgentMessageContributor[];
  hooks?: AgentRuntimeHook[];
  runtime?: AgentRuntimeConfig;
  observers?: AgentObserver[];
  policies?: AgentPolicies;
  session?: AgentSession;
}
