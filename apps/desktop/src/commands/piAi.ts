/**
 * pi-ai 单发路径的渲染端封装：请求经 IPC 到主进程 pi-ai 模块，流事件按 requestId 过滤回调。
 * 事件形状为 pi-ai 原生 AssistantMessageEvent（含 partial 全量快照），不做二次包装——
 * 升级 pi 时消费方只需跟进事件类型本身。
 */
import { invoke, on, off } from "@/electron";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
import type {
  LLMProviderSetting,
  PiCatalogModel,
  PiCatalogProvider,
  PiDiscoveredModel,
  PiSingleShotOutcome,
  PiSingleShotRequest,
  PiThinkingLevel,
} from "@/types/pi-llm";

export type PiStreamEvent = AssistantMessageEvent;

/** pi 内置服务商目录（纯读、不联网）：只含本运行时支持的线协议能跑的服务商 */
export function piCatalogProviders(): Promise<{
  ok: boolean;
  error?: string;
  providers: PiCatalogProvider[];
}> {
  return invoke("pi-ai:catalog-providers");
}

/** 某内置服务商下受支持的模型（含上下文窗口、能力、推理档位等元数据） */
export function piCatalogModels(builtin: string): Promise<{
  ok: boolean;
  error?: string;
  models: PiCatalogModel[];
}> {
  return invoke("pi-ai:catalog-models", { builtin });
}

/** 实时拉取服务商 `/models` 列表（联网）；失败时 error 是可直接展示的原因 */
export function piDiscoverModels(provider: LLMProviderSetting): Promise<{
  ok: boolean;
  error?: string;
  models: PiDiscoveredModel[];
}> {
  return invoke("pi-ai:discover-models", { provider });
}

/** 已配置模型真实支持的推理档位；fromCatalog=false 表示目录未命中、返回的是通用档 */
/** 用一次最短对话验证服务商的 API Key（集成设置用；服务商不进注册表） */
export function piVerifyProviderKey(
  provider: LLMProviderSetting,
  modelId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return invoke("pi-ai:verify-key", { provider, modelId });
}

/**
 * Minimax 集成（播客 TTS、声音克隆等）的 Key 验证：走 pi 内置目录的 minimax-cn 服务商
 * （Anthropic 协议端点），与聊天模型配置无关。
 */
export async function verifyMinimaxApiKey(apiKey: string): Promise<void> {
  const outcome = await piVerifyProviderKey(
    {
      id: "integration-minimax",
      name: "Minimax",
      baseUrl: "https://api.minimaxi.com/anthropic",
      apiKey,
      api: "anthropic-messages",
      builtin: "minimax-cn",
      models: [{ id: MINIMAX_VERIFY_MODEL, reasoning: true, input: ["text"] }],
    },
    MINIMAX_VERIFY_MODEL
  );
  if (!outcome.ok) throw new Error(outcome.error);
}

const MINIMAX_VERIFY_MODEL = "MiniMax-M2.7";

export function piThinkingLevels(
  provider: LLMProviderSetting,
  modelId: string
): Promise<{ ok: boolean; error?: string; levels: PiThinkingLevel[]; fromCatalog: boolean }> {
  return invoke("pi-ai:thinking-levels", { provider, modelId });
}
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
