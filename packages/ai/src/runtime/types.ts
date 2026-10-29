import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ChatSessionMessage,
  MessageContent,
  ThinkingLevel,
  ResponseMessage,
  AskQuestionPayload,
  AskQuestionSubmission,
} from "@tau/shared/chat-core";
import type {
  AiError,
  AiModelRef,
  AiRunOutcome,
  AiRunStartRequest,
  AiRunStatus,
  AiSessionRef,
  AiSessionRow,
} from "../contracts";
import type { SessionDocument, SessionEntry } from "../session/index";
import type {
  AiToolApprovalChoice,
  AiToolApprovalRequest,
  AiToolRegistry,
  AiToolSnapshot,
  ToolPermissionMode,
} from "../tools/index";

export interface AiStoredSession {
  document: SessionDocument;
  row: AiSessionRow;
  revision: string;
}

export interface AiSessionStore {
  read(ref: AiSessionRef): Promise<AiStoredSession>;
  append(
    ref: AiSessionRef,
    expectedRevision: string,
    entries: SessionEntry[],
    operationId: string
  ): Promise<AiStoredSession>;
  beginRun(ref: AiSessionRef, runId: string): Promise<() => Promise<void>>;
}

export interface AiResolvedModel {
  model: Model<Api>;
  fetch: typeof globalThis.fetch;
  dispose(): Promise<void>;
  stripThinkTags?: boolean;
  defaultThinkingLevel?: ThinkingLevel;
}

export interface AiApproval {
  requestId: string;
  executionId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  revision: number;
}

export interface AiQuestion {
  requestId: string;
  executionId: string;
  toolCallId: string;
  payload: AskQuestionPayload;
  revision: number;
}

export interface AiRunSnapshot {
  runId: string;
  session: AiSessionRef;
  seq: number;
  status: AiRunStatus;
  revision: string;
  messages: ChatSessionMessage[];
  approvals: AiApproval[];
  questions: AiQuestion[];
  interactionRevision: number;
  outcome?: AiRunOutcome;
  error?: ReturnType<AiError["toJSON"]>;
}

export interface AiRunResult {
  runId: string;
  session: AiSessionRef;
  outcome: AiRunOutcome;
  committedRevision: string;
  messages: ChatSessionMessage[];
  error?: ReturnType<AiError["toJSON"]>;
}

export interface AiRunHandle {
  runId: string;
  result: Promise<AiRunResult>;
  abort(): Promise<void>;
}

export type AiRetryRunRequest = Omit<AiRunStartRequest, "message"> & { entryId: string };

export interface AiRuntimeNotification {
  runId: string;
  seq: number;
  session: AiSessionRef;
  event: { type: "snapshot"; snapshot: AiRunSnapshot } | { type: "settled"; result: AiRunResult };
}

export interface AiRuntimeOptions {
  store: AiSessionStore;
  tools: AiToolRegistry;
  resolveModel(
    ref: AiModelRef,
    session: AiSessionRef,
    expectedModelRevision?: string
  ): Promise<AiResolvedModel>;
  prepareInput?(
    content: MessageContent[],
    signal: AbortSignal
  ): Promise<Extract<AgentMessage, { role: "user" }>["content"]>;
  preparePrompt?(
    request: AiRunStartRequest,
    signal: AbortSignal
  ): Promise<string | AiPromptUpdate | undefined>;
  prepareTools?(
    request: AiRunStartRequest,
    signal: AbortSignal,
    base: AiToolSnapshot
  ): Promise<{ snapshot: AiToolSnapshot; dispose?: () => void | Promise<void> }>;
  permissionMode?: () => ToolPermissionMode;
  approve?: (request: AiToolApprovalRequest) => Promise<AiToolApprovalChoice>;
  question?: (request: AiQuestion, signal: AbortSignal) => Promise<AskQuestionSubmission>;
  maxTurns?: number;
}

export interface AiPromptUpdate {
  content?: string;
  sections?: Record<string, string | null>;
}

export interface AiGenerationRequest {
  requestId: string;
  databaseName: string;
  model: AiModelRef;
  expectedModelRevision?: string;
  messages: Array<
    | { role: "user"; content: string; images?: { data: string; mimeType: string }[] }
    | { role: "assistant"; content: string }
  >;
  system?: string;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiGenerationResult {
  outcome: AiRunOutcome;
  response: ResponseMessage | null;
  error?: ReturnType<AiError["toJSON"]>;
}

export interface AiGenerationHandle {
  requestId: string;
  result: Promise<AiGenerationResult>;
  abort(): void;
}
