import type { ChatSessionMessage } from "@/types";

export const SUBAGENT_TOOL_NAMES = [
  "spawn_agent",
  "send_agent",
  "wait_agent",
  "cancel_agent",
  "send_parent",
] as const;
/** 工具结果 details.render 的标识：任务卡据此读取子 Agent 身份 */
export const SUBAGENT_RENDERER_KEY = "subagent";

export type SubagentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export type SubagentOutcome =
  | { status: "completed"; result: string }
  | { status: "failed" | "interrupted"; error: { message: string } }
  | { status: "cancelled" };

export interface SubagentOrigin {
  parentKey: string;
  branchId: string | null;
  generation: number;
}

export interface SubagentSession {
  agentId: string;
  parentKey: string;
  title: string;
  databaseName: string;
  cwd: string;
  createdAt: number;
}

export interface SubagentRun {
  runId: string;
  agentId: string;
  requestKey: string;
  input: string;
  mode: "sync" | "async";
  origin: SubagentOrigin;
  status: SubagentRunStatus;
  outcome?: SubagentOutcome;
  createdAt: number;
  /** 离开排队、真正开始执行的时间；耗时从这里算起 */
  startedAt?: number;
  finishedAt?: number;
}

export interface SubagentParentMessage {
  messageId: string;
  agentId: string;
  runId: string;
  origin: SubagentOrigin;
  payload: { kind: "progress"; text: string } | { kind: "terminal"; outcome: SubagentOutcome };
  delivered: boolean;
}

/** 执行中子会话最近一步：工具调用显示工具名与参数摘要，模型输出期间显示思考 */
export interface SubagentActivity {
  kind: "tool" | "thinking";
  toolName?: string;
  summary?: string;
  at: number;
}

export interface SubagentView {
  agent: SubagentSession;
  runs: SubagentRun[];
  hostId?: string;
  parentScope: string;
  /** 仅在有执行中任务时提供 */
  activity?: SubagentActivity;
}

/** 渲染端正在展示的父对话：父宿主不在时据此读取持久记录 */
export interface SubagentParentRef {
  /** 父会话界面作用域（会话键），列表视图的 parentScope 取它 */
  scope: string;
  databaseName: string;
  chatId: string;
}

export interface SubagentSnapshot {
  revision: number;
  agents: SubagentView[];
}

export interface SubagentDetail {
  view: SubagentView;
  messages: ChatSessionMessage[];
  streamingMessage?: unknown;
}

export type SubagentWaitResult = {
  agentId: string;
  runId: string;
} & (
  | { reason: "terminal"; outcome: SubagentOutcome }
  | { reason: "timeout"; status: SubagentRunStatus }
);

export const isSubagentTerminal = (run: SubagentRun): boolean =>
  run.status !== "queued" && run.status !== "running";
