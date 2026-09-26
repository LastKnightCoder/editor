/**
 * pi-ai 单发路径的渲染端封装：请求经 IPC 到主进程 pi-ai 模块，流事件按 requestId 过滤回调。
 * 事件形状为 pi-ai 原生 AssistantMessageEvent（主进程已剥离 partial 快照，done 携带最终 message），
 * 不做二次包装——升级 pi 时消费方只需跟进事件类型本身。
 */
import { invoke, on, off } from "@/electron";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { PiSingleShotOutcome, PiSingleShotRequest } from "@/types/pi-llm";

export type PiStreamEvent = Omit<AssistantMessageEvent, "partial">;
type PiStreamEventEnvelope = PiStreamEvent & { requestId: string };

export type PiSingleShotOptions = Omit<PiSingleShotRequest, "requestId">;

export async function piAiSingleShot(
  options: PiSingleShotOptions,
  onEvent?: (event: PiStreamEvent) => void,
  /** 外部指定 requestId（调用方需要联动本地 AbortController 取消时使用） */
  requestId?: string
): Promise<PiSingleShotOutcome> {
  const id = requestId ?? crypto.randomUUID();
  // preload 的 on 透传 ipcRenderer.on：第一个参数是 IPC event，载荷在第二位（项目既有约定）
  const listener = onEvent
    ? (_ipcEvent: unknown, payload: PiStreamEventEnvelope) => {
        if (payload?.requestId === id) onEvent(payload);
      }
    : null;
  if (listener) on("pi-ai-stream-event", listener);
  try {
    return await invoke<PiSingleShotOutcome>("pi-ai:single-shot", { ...options, requestId: id });
  } finally {
    if (listener) off("pi-ai-stream-event", listener);
  }
}

export function piAiCancel(requestId: string): Promise<boolean> {
  return invoke<boolean>("pi-ai:cancel", { requestId });
}
