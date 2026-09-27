/**
 * 服务商模型实时发现（M3-f，纯逻辑，无 Electron 依赖，可单测）：
 * 请求服务商的 `/models` 接口，覆盖目录外的自建服务（Ollama/LM Studio/私有网关）
 * 与目录落后于服务商新模型两种情况。
 *
 * 元数据策略与 toPiModel 一致：目录命中则目录权威（与勾选目录同等可信）；
 * 未命中只取接口自报的字段，缺的留空——不瞎猜 128k/8192 这类默认值。
 * 凭据只发往用户自己配置的 baseUrl。
 */
import type { LLMProviderSetting, PiDiscoveredModel } from "@/types/pi-llm";
import {
  isSupportedModel,
  lookupBuiltinModel,
  resolveBuiltinId,
  toCatalogModel,
} from "./pi-ai-runtime-core";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const DISCOVERY_TIMEOUT_MS = 15_000;
/** Anthropic 的列表接口分页；设上限防服务端 has_more 一直为真时死循环 */
const MAX_PAGES = 10;

/** 面向用户的失败原因（界面直接展示，不暴露接口细节） */
export class ModelDiscoveryError extends Error {}

/** 列表接口地址：Anthropic SDK 在 baseUrl 后拼 /v1/…，OpenAI 系的 baseUrl 本身已含版本段 */
export function modelsEndpoint(setting: LLMProviderSetting): string {
  const base = setting.baseUrl.trim().replace(/\/+$/, "");
  if (setting.api === "anthropic-messages") {
    return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
  }
  return `${base}/models`;
}

function authHeaders(setting: LLMProviderSetting): Record<string, string> {
  if (setting.api === "anthropic-messages") {
    return {
      "anthropic-version": "2023-06-01",
      ...(setting.apiKey ? { "x-api-key": setting.apiKey } : {}),
    };
  }
  return setting.apiKey ? { Authorization: `Bearer ${setting.apiKey}` } : {};
}

const positiveInt = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return undefined;
};

/**
 * 接口条目 → 发现结果（未命中目录时）。各家字段名不统一，只认几个常见的：
 * OpenRouter 的 context_length/architecture/supported_parameters、LM Studio 的 max_context_length、
 * Anthropic 的 display_name/max_input_tokens。认不出的字段一律留空。
 */
function fromRemoteEntry(entry: Record<string, any>, id: string): PiDiscoveredModel {
  const name =
    typeof entry.display_name === "string"
      ? entry.display_name
      : typeof entry.name === "string"
        ? entry.name
        : id;
  const modalities = entry.architecture?.input_modalities;
  const parameters = entry.supported_parameters;
  const contextWindow = positiveInt(
    entry.context_length,
    entry.context_window,
    entry.max_context_length,
    entry.max_input_tokens,
    entry.top_provider?.context_length
  );
  const maxTokens = positiveInt(
    entry.max_output_tokens,
    entry.max_completion_tokens,
    entry.top_provider?.max_completion_tokens
  );
  return {
    id,
    name,
    fromCatalog: false,
    ...(Array.isArray(modalities)
      ? { input: modalities.includes("image") ? ["text", "image"] : ["text"] }
      : {}),
    ...(Array.isArray(parameters) ? { reasoning: parameters.includes("reasoning") } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxTokens ? { maxTokens } : {}),
  };
}

/** 兼容三种返回形状：OpenAI `{data:[…]}`、Ollama 原生 `{models:[…]}`、裸数组 */
function entriesOf(body: unknown): Record<string, any>[] {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as any)?.data)
      ? (body as any).data
      : Array.isArray((body as any)?.models)
        ? (body as any).models
        : null;
  if (!list) throw new ModelDiscoveryError("服务返回的模型列表格式无法识别");
  return list.filter((item: unknown) => item && typeof item === "object");
}

async function requestPage(
  url: string,
  setting: LLMProviderSetting,
  signal: AbortSignal,
  fetchImpl: FetchLike
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", ...authHeaders(setting) },
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new ModelDiscoveryError("获取超时，请检查服务地址或网络");
    throw new ModelDiscoveryError(
      `无法连接到服务地址（${error instanceof Error ? error.message : String(error)}）`
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new ModelDiscoveryError("API Key 无效或没有权限");
  }
  if (response.status === 404) {
    throw new ModelDiscoveryError("该服务不支持获取模型列表，请手动添加");
  }
  if (!response.ok) {
    throw new ModelDiscoveryError(`服务返回错误（HTTP ${response.status}）`);
  }
  try {
    return await response.json();
  } catch {
    throw new ModelDiscoveryError("服务返回的模型列表格式无法识别");
  }
}

/**
 * 拉取服务商当前可用的模型。结果按 id 去重、按展示名排序；
 * 目录命中但协议不受支持的模型（跑不起来）直接剔除。
 */
export async function discoverProviderModels(
  setting: LLMProviderSetting,
  options: { fetchImpl?: FetchLike; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<PiDiscoveredModel[]> {
  if (!setting.baseUrl.trim()) throw new ModelDiscoveryError("请先填写服务地址");
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DISCOVERY_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  const endpoint = modelsEndpoint(setting);
  const entries: Record<string, any>[] = [];
  if (setting.api === "anthropic-messages") {
    let afterId: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = `${endpoint}?limit=1000${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ""}`;
      const body = (await requestPage(url, setting, signal, fetchImpl)) as Record<string, any>;
      entries.push(...entriesOf(body));
      if (!body?.has_more || typeof body.last_id !== "string") break;
      afterId = body.last_id;
    }
  } else {
    entries.push(...entriesOf(await requestPage(endpoint, setting, signal, fetchImpl)));
  }

  const builtin = await resolveBuiltinId(setting);
  const byId = new Map<string, PiDiscoveredModel>();
  for (const entry of entries) {
    const rawId = entry.id ?? entry.model ?? entry.name;
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id || byId.has(id)) continue;
    const base = builtin ? await lookupBuiltinModel(builtin, id) : undefined;
    if (base) {
      if (!isSupportedModel(base)) continue;
      const catalog = toCatalogModel(base);
      byId.set(id, {
        id,
        name: catalog.name,
        fromCatalog: true,
        api: catalog.api,
        reasoning: catalog.reasoning,
        input: catalog.input,
        contextWindow: catalog.contextWindow,
        maxTokens: catalog.maxTokens,
        ...(catalog.cost ? { cost: catalog.cost } : {}),
      });
      continue;
    }
    byId.set(id, fromRemoteEntry(entry, id));
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
