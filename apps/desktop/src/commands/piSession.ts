/**
 * PiSessionHost 的渲染端封装：
 * 会话生命周期经 IPC 驱动，事件为 pi-coding-agent 原生 AgentSessionEvent（按 sessionId 过滤回调），无二次包装。
 * 工具桥：主进程 pi-tool-call 事件 → 渲染端执行 → pi-session:tool-* 回传。
 */
import { invoke, on, off } from "@/electron";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { PiThinkingLevel } from "@/types/pi-llm";
import type {
  PiHostToolCallResult,
  PiPromptImage,
  PiSessionCreateRequestV2,
  PiToolCallPayload,
  PiToolApprovalChoice,
  PiSessionInteractionSnapshot,
} from "@/types/pi-session";
import type { AskQuestionAnswerItem } from "@/tools/askQuestionTypes";
import type { ChatSessionMessage } from "@/types";

export type PiSessionCreateOptions = Omit<PiSessionCreateRequestV2, "sessionId">;

interface Outcome {
  ok: boolean;
  error?: string;
}

/** 本窗口全部宿主会话的待处理交互（工具审批 + 提问）快照 */
export function piSessionInteractions(): Promise<
  Outcome & { snapshots: PiSessionInteractionSnapshot[] }
> {
  return invoke("pi-session:interactions");
}

export function piSessionApproveTool(
  sessionId: string,
  requestId: string,
  choice: PiToolApprovalChoice
): Promise<Outcome> {
  return invoke("pi-session:approve-tool", { sessionId, requestId, choice });
}

export function piSessionAnswerQuestion(
  sessionId: string,
  requestId: string,
  answers: AskQuestionAnswerItem[]
): Promise<Outcome> {
  return invoke("pi-session:answer-question", { sessionId, requestId, answers });
}

export function onPiSessionInteractions(
  listener: (snapshot: PiSessionInteractionSnapshot) => void
): () => void {
  const handler = (_event: unknown, snapshot: PiSessionInteractionSnapshot) => listener(snapshot);
  on("pi-session-interactions", handler);
  return () => off("pi-session-interactions", handler);
}

/** 创建/打开会话；返回 pi 会话 id 与会话文件名（目录表据此登记，下次打开走 resume） */
export function piSessionCreate(
  sessionId: string,
  options: PiSessionCreateOptions
): Promise<Outcome & { piSessionId?: string; sessionFile?: string }> {
  return invoke("pi-session:create", { sessionId, ...options });
}

export function piSessionPrompt(
  sessionId: string,
  text: string,
  images?: PiPromptImage[]
): Promise<Outcome> {
  return invoke<Outcome>("pi-session:prompt", { sessionId, text, images });
}

/**
 * 运行中插话：交 pi 原生 steer 队列，在当前轮工具跑完后、下一次请求模型前送达。
 * reason=not-streaming 表示这轮已经结束（会话空闲），调用方应改走普通发送/排队。
 */
export function piSessionSteer(
  sessionId: string,
  text: string,
  images?: PiPromptImage[]
): Promise<Outcome & { reason?: "not-streaming" | "error" }> {
  return invoke("pi-session:steer", { sessionId, text, images });
}

/** 中止会话；stranded = 中止时还没送达、已被清出 pi 队列的插话文本 */
export function piSessionAbort(sessionId: string): Promise<Outcome & { stranded?: string[] }> {
  return invoke("pi-session:abort", { sessionId });
}

export function piSessionDispose(sessionId: string): Promise<Outcome> {
  return invoke<Outcome>("pi-session:dispose", { sessionId });
}

/**
 * 读对话内容（M4）：会话文件当前叶子路径 → 桌面展示消息。纯读，不起 pi 会话。
 * sessionFile 为目录表里存的相对文件名；文件尚不存在（首轮没等到回答）返回空数组。
 */
export function piSessionTranscript(
  sessionFile: string
): Promise<Outcome & { messages?: ChatSessionMessage[] }> {
  return invoke("pi-session:transcript", { sessionFile });
}

/** 渲染层重载后按 scope 找主进程仍持有的会话（待审批/待回答交互恢复用） */
export function piSessionFindByScope(scope: string): Promise<
  Outcome & {
    sessionId?: string;
    modelRef?: { providerId: string; modelId: string };
    thinkingLevel?: PiThinkingLevel;
  }
> {
  return invoke("pi-session:find-by-scope", { scope });
}

export interface PiShellInfo {
  ok: boolean;
  /** 本机自动检测到的 shell（Windows 上的 Git Bash） */
  detected?: string;
  /** 用户在设置里填的路径 */
  configured?: string;
  /** probe（或已填路径）是否存在；未填时为 undefined */
  configuredExists?: boolean;
  /** 实际会用的路径；为空表示 pi 走 PowerShell 兜底 */
  effective?: string;
}

/** 命令执行环境状态；probe 传入待校验的路径（设置页边输入边提示） */
export function piSessionShellInfo(probe?: string): Promise<PiShellInfo> {
  return invoke("pi-session:shell-info", probe === undefined ? {} : { probe });
}

/**
 * 切换会话的活跃工具集（下一轮生效）。注册全集在创建时定死，这里只改启用子集，
 * 用户开关工具无需重建会话。工具定义渲染在请求最前，只在真变化时调用。
 */
export function piSessionSetActiveTools(
  sessionId: string,
  activeToolNames: string[]
): Promise<Outcome> {
  return invoke("pi-session:set-active-tools", { sessionId, activeToolNames });
}

/** 每轮 agent start 前替换会话 systemPrompt（system 变化不重建会话） */
export function piSessionSetSystemPrompt(
  sessionId: string,
  systemPrompt: string
): Promise<Outcome> {
  return invoke<Outcome>("pi-session:set-system-prompt", { sessionId, systemPrompt });
}

export function piSessionToolResult(
  sessionId: string,
  toolCallId: string,
  result: PiHostToolCallResult
): Promise<Outcome> {
  return invoke<Outcome>("pi-session:tool-result", { sessionId, toolCallId, result });
}

export function piSessionToolError(
  sessionId: string,
  toolCallId: string,
  error: string
): Promise<Outcome> {
  return invoke<Outcome>("pi-session:tool-error", { sessionId, toolCallId, error });
}

export function piSessionToolUpdate(
  sessionId: string,
  toolCallId: string,
  partial: Record<string, unknown>
): Promise<Outcome> {
  return invoke<Outcome>("pi-session:tool-update", { sessionId, toolCallId, partial });
}

type PiSessionEventEnvelope = { sessionId: string; event: AgentSessionEvent };

export function onPiSessionEvent(
  sessionId: string,
  listener: (event: AgentSessionEvent) => void
): () => void {
  // preload 的 on 透传 ipcRenderer.on：第一个参数是 IPC event，载荷在第二位（项目既有约定）
  const handler = (_ipcEvent: unknown, payload: PiSessionEventEnvelope) => {
    if (payload?.sessionId === sessionId) listener(payload.event);
  };
  on("pi-session-event", handler);
  return () => off("pi-session-event", handler);
}

export function onPiToolCall(listener: (payload: PiToolCallPayload) => void): () => void {
  const handler = (_ipcEvent: unknown, payload: PiToolCallPayload) => {
    if (payload?.sessionId) listener(payload);
  };
  on("pi-tool-call", handler);
  return () => off("pi-tool-call", handler);
}
