/**
 * PiSessionHost 的渲染端封装（M2 骨架）：
 * 会话生命周期经 IPC 驱动，事件为 pi-coding-agent 原生 AgentSessionEvent（按 sessionId 过滤回调），无二次包装。
 */
import { invoke, on, off } from "@/electron";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export interface PiSessionCreateOptions {
  scope: string;
  cwd: string;
  modelRef: { providerId: string; modelId: string };
  systemPrompt?: string;
  persist?: boolean;
  /** 手动指定 bash.exe（pi-dev 面板联调用；产品化设置项在 M3 落地） */
  shellPath?: string;
}

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
