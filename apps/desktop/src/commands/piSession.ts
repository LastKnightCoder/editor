/**
 * PiSessionHost 的渲染端封装：
 * 会话生命周期经 IPC 驱动，事件为 pi-coding-agent 原生 AgentSessionEvent（按 sessionId 过滤回调），无二次包装。
 * 工具桥：主进程 pi-tool-call 事件 → 渲染端执行 → pi-session:tool-* 回传。
 */
import { invoke, on, off } from "@/electron";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type {
  PiHostToolCallResult,
  PiSessionCreateRequestV2,
  PiToolCallPayload,
} from "@/types/pi-session";

export type PiSessionCreateOptions = Omit<PiSessionCreateRequestV2, "sessionId">;

interface Outcome {
  ok: boolean;
  error?: string;
}

export function piSessionCreate(
  sessionId: string,
  options: PiSessionCreateOptions
): Promise<Outcome> {
  return invoke<Outcome>("pi-session:create", { sessionId, ...options });
}

export function piSessionPrompt(
  sessionId: string,
  text: string,
  images?: unknown[]
): Promise<Outcome> {
  return invoke<Outcome>("pi-session:prompt", { sessionId, text, images });
}

export function piSessionSteer(
  sessionId: string,
  text: string
): Promise<Outcome & { disposition?: string }> {
  return invoke("pi-session:steer", { sessionId, text });
}

export function piSessionAbort(sessionId: string): Promise<Outcome> {
  return invoke<Outcome>("pi-session:abort", { sessionId });
}

export function piSessionDispose(sessionId: string): Promise<Outcome> {
  return invoke<Outcome>("pi-session:dispose", { sessionId });
}

/** 渲染层重载后按 scope 找主进程仍持有的会话（ask-question 挂起恢复用） */
export function piSessionFindByScope(scope: string): Promise<Outcome & { sessionId?: string }> {
  return invoke("pi-session:find-by-scope", { scope });
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
