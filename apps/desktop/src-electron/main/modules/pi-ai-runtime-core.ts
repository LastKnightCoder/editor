/**
 * pi-ai 运行时核心（纯逻辑，无 Electron 依赖，可单测）：
 * 设置 v2（LLMProviderSetting）→ pi Provider/Model 的构建、provider 注册表同步、单发请求组装。
 * 模块壳（IPC/设置订阅）在 pi-ai-runtime.ts。
 */
import * as anthropicMessagesApi from "@earendil-works/pi-ai/api/anthropic-messages";
import * as openAICompletionsApi from "@earendil-works/pi-ai/api/openai-completions";
import * as openAIResponsesApi from "@earendil-works/pi-ai/api/openai-responses";
import { createModels, createProvider, getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type {
  Api,
  Context,
  Message,
  Model,
  MutableModels,
  Provider,
  ProviderStreams,
} from "@earendil-works/pi-ai";
import type {
  LLMModelSetting,
  LLMProviderSetting,
  PiApiKind,
  PiCatalogModel,
  PiCatalogProvider,
  PiSingleShotRequest,
  PiThinkingLevel,
} from "@/types/pi-llm";

/**
 * 从设置快照解析 v2 provider 列表：v2 字段 llmProviders 上线前，
 * 现场把旧 llmConfigs 转换兜底（与 pi-dev 面板同源），store 切换后旧分支自然失效
 */
export function resolveV2Providers(
  setting: Record<string, unknown> | undefined | null
): LLMProviderSetting[] {
  const providers = setting?.llmProviders;
  return Array.isArray(providers) ? (providers as LLMProviderSetting[]) : [];
}

const API_STREAMS: Record<PiApiKind, ProviderStreams> = {
  "openai-completions": openAICompletionsApi,
  "openai-responses": openAIResponsesApi,
  "anthropic-messages": anthropicMessagesApi,
};

/** 内置目录基底：命中时目录值权威（含 compat/thinkingLevelMap/cost），用户手填仅兜底未收录键 */
export function toPiModel(
  model: LLMModelSetting,
  provider: LLMProviderSetting,
  base?: Model<Api>
): Model<Api> {
  const contextWindow = base?.contextWindow ?? model.contextWindow;
  const maxTokens = base?.maxTokens ?? model.maxTokens;
  if (
    !contextWindow ||
    !Number.isSafeInteger(contextWindow) ||
    contextWindow <= 0 ||
    !maxTokens ||
    !Number.isSafeInteger(maxTokens) ||
    maxTokens <= 0
  ) {
    throw new Error(
      `模型 ${model.id} 缺少有效容量，请在模型设置中填写上下文窗口和最大输出 token 数`
    );
  }
  const piModel: Model<Api> = {
    id: model.id,
    name: model.name ?? base?.name ?? model.id,
    // 目录权威 → 模型自带（混合 api 服务商的兜底）→ 服务商级兜底
    api: base?.api ?? model.api ?? provider.api,
    provider: provider.id,
    baseUrl: provider.baseUrl,
    reasoning: base?.reasoning ?? model.reasoning,
    input: base?.input ?? model.input,
    cost: base?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
  };
  if (base?.thinkingLevelMap) piModel.thinkingLevelMap = base.thinkingLevelMap;
  if (base?.compat && !model.compat) piModel.compat = base.compat as never;
  if (model.samplingParams) piModel.samplingParams = model.samplingParams;
  if (model.headers) piModel.headers = model.headers;
  if (model.compat) piModel.compat = model.compat as never;
  return piModel;
}

/** 共享的内置目录查询（懒创建 ModelRuntime，仅用于查询，不注册自定义 provider） */
let catalogRuntime: Promise<ModelRuntimeLike | null> | null = null;
interface ModelRuntimeLike {
  getModel(providerId: string, modelId: string): Model<Api> | undefined;
  getProviders(): Array<{ id: string; name?: string; baseUrl?: string }>;
  getModels(providerId?: string): readonly Model<Api>[];
}
async function getCatalogRuntime(): Promise<ModelRuntimeLike | null> {
  catalogRuntime ??= import("@earendil-works/pi-coding-agent")
    .then(async ({ ModelRuntime }) => {
      const os = await import("node:os");
      const { join } = await import("node:path");
      return ModelRuntime.create({
        // 按进程隔离：共用固定路径时多个进程（并行测试 worker、多实例）会抢同一个 auth 文件
        authPath: join(os.tmpdir(), `tau-pi-catalog-${process.pid}.json`),
        allowModelNetwork: false,
      }) as unknown as ModelRuntimeLike;
    })
    .catch(error => {
      console.error("[pi-ai] 内置目录加载失败:", error);
      return null;
    });
  return catalogRuntime;
}

/** 解析 provider 的 builtin 标识：显式设置优先，否则按 baseUrl 匹配内置目录（官方域名确定性映射） */
export async function resolveBuiltinId(setting: LLMProviderSetting): Promise<string | undefined> {
  if (setting.builtin) return setting.builtin;
  const runtime = await getCatalogRuntime();
  if (!runtime) return undefined;
  const normalized = setting.baseUrl.replace(/\/+$/, "").toLowerCase();
  const match = runtime
    .getProviders()
    .find(p => p.baseUrl && p.baseUrl.replace(/\/+$/, "").toLowerCase() === normalized);
  return match?.id;
}

/** 本项目支持的线协议：目录里另有 7 种（bedrock/google/vertex 等）本运行时跑不起来，一律不暴露 */
const SUPPORTED_APIS = new Set<string>([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
]);

export const isSupportedModel = (model: Model<Api>): boolean => SUPPORTED_APIS.has(model.api);

/** 目录模型 → 渲染端形状（含真实推理档位；不支持推理时为空数组） */
export function toCatalogModel(model: Model<Api>): PiCatalogModel {
  const levels = model.reasoning
    ? (getSupportedThinkingLevels(model) as PiThinkingLevel[])
    : ([] as PiThinkingLevel[]);
  return {
    id: model.id,
    name: model.name ?? model.id,
    api: model.api as PiApiKind,
    reasoning: model.reasoning,
    input: (model.input ?? ["text"]).filter(
      (kind): kind is "text" | "image" => kind === "text" || kind === "image"
    ),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    ...(model.cost && (model.cost.input || model.cost.output)
      ? { cost: { input: model.cost.input, output: model.cost.output } }
      : {}),
    thinkingLevels: levels,
  };
}

/**
 * 内置服务商目录（只列有受支持模型的服务商）。服务商级 api 取其模型里占多数的那种——
 * 仅作手填模型的兜底，勾选来的模型各自带 api（混合 api 服务商如 OpenRouter）。
 */
export async function listCatalogProviders(): Promise<PiCatalogProvider[]> {
  const runtime = await getCatalogRuntime();
  if (!runtime) return [];
  const providers: PiCatalogProvider[] = [];
  for (const provider of runtime.getProviders()) {
    const models = runtime.getModels(provider.id).filter(isSupportedModel);
    if (models.length === 0) continue;
    const tally = new Map<string, number>();
    for (const model of models) tally.set(model.api, (tally.get(model.api) ?? 0) + 1);
    const [dominant] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    providers.push({
      id: provider.id,
      name: provider.name ?? provider.id,
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
      api: dominant[0] as PiApiKind,
      modelCount: models.length,
    });
  }
  return providers.sort((a, b) => a.name.localeCompare(b.name));
}

/** 某内置服务商下受支持的模型（按展示名排序，供设置页勾选） */
export async function listCatalogModels(builtinId: string): Promise<PiCatalogModel[]> {
  const runtime = await getCatalogRuntime();
  if (!runtime) return [];
  return runtime
    .getModels(builtinId)
    .filter(isSupportedModel)
    .map(toCatalogModel)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 已配置的 provider+model 真实支持的推理档位：目录命中用 pi 的判定，
 * 未命中（自定义服务商/目录外模型）返回通用档，由调用方决定怎么展示。
 */
export async function resolveThinkingLevels(
  setting: LLMProviderSetting,
  modelId: string
): Promise<{ levels: PiThinkingLevel[]; fromCatalog: boolean }> {
  const builtin = await resolveBuiltinId(setting);
  const model = setting.models.find(item => item.id === modelId);
  if (builtin) {
    const base = await lookupBuiltinModel(builtin, modelId);
    if (base) {
      return {
        levels: base.reasoning ? (getSupportedThinkingLevels(base) as PiThinkingLevel[]) : [],
        fromCatalog: true,
      };
    }
  }
  return {
    levels: model?.reasoning ? GENERIC_THINKING_LEVELS : [],
    fromCatalog: false,
  };
}

/** 目录外模型的通用档（pi 会按模型能力 clamp，多给不会出错但可能无效） */
const GENERIC_THINKING_LEVELS: PiThinkingLevel[] = ["off", "low", "medium", "high"];

/** 按 builtin+modelId 查内置目录的模型元数据 */
export async function lookupBuiltinModel(
  builtin: string,
  modelId: string
): Promise<Model<Api> | undefined> {
  const runtime = await getCatalogRuntime();
  return runtime?.getModel(builtin, modelId);
}

/** 设置 v2 → pi Provider（内置目录兜底后）；apiKey 从设置内存值经 auth resolve 注入（BYO 网关模式） */
export async function buildPiProvider(setting: LLMProviderSetting): Promise<Provider> {
  const builtin = await resolveBuiltinId(setting);
  const models: Model<Api>[] = [];
  for (const model of setting.models) {
    const base = builtin ? await lookupBuiltinModel(builtin, model.id) : undefined;
    if (!base && (!model.contextWindow || !model.maxTokens)) continue;
    models.push(toPiModel(model, setting, base));
  }
  return createProvider({
    id: setting.id,
    name: setting.name,
    baseUrl: setting.baseUrl,
    auth: {
      apiKey: {
        name: `${setting.name}（应用设置）`,
        // pi 把缺失 key 视为「未配置 provider」直接拒绝请求；无 key 本地网关（Ollama 等）
        // 必须塞占位 key 才能放行——网关会忽略 Authorization 头
        resolve: async () =>
          setting.apiKey
            ? { auth: { apiKey: setting.apiKey }, source: "app-settings" }
            : { auth: { apiKey: "no-key-required" }, source: "app-settings(keyless)" },
      },
    },
    models,
    api: API_STREAMS[setting.api],
  });
}

export interface ProviderRegistry {
  readonly models: MutableModels;
  /** 全量同步设置里的 provider 列表：新增/变更 upsert，移除 delete（目录兜底为异步） */
  syncProviders(settings: LLMProviderSetting[]): Promise<void>;
  resolveModel(providerId: string, modelId: string): Model<Api> | undefined;
  /** 该模型是否启用 <think> 标签兜底剥离（见 think-stream-rewriter） */
  needsThinkStrip(providerId: string, modelId: string): boolean;
}

export function createProviderRegistry(): ProviderRegistry {
  const models = createModels();
  const registered = new Map<string, string>();
  const settingsById = new Map<string, LLMProviderSetting>();
  return {
    models,
    async syncProviders(settings) {
      const nextIds = new Set(settings.map(s => s.id));
      for (const id of [...registered.keys()]) {
        if (!nextIds.has(id)) {
          models.deleteProvider(id);
          registered.delete(id);
          settingsById.delete(id);
        }
      }
      for (const setting of settings) {
        const fingerprint = JSON.stringify(setting);
        if (registered.get(setting.id) === fingerprint) continue;
        models.setProvider(await buildPiProvider(setting));
        registered.set(setting.id, fingerprint);
        settingsById.set(setting.id, setting);
      }
    },
    resolveModel(providerId, modelId) {
      return models.getModel(providerId, modelId);
    },
    needsThinkStrip(providerId, modelId) {
      return (
        settingsById.get(providerId)?.models.find(m => m.id === modelId)?.stripThinkTags === true
      );
    },
  };
}

/**
 * 用一次最短对话验证服务商的 API Key（集成设置的「连接」用，如 Minimax）。服务商不进注册表：
 * 临时建一个 pi Provider 发一条消息。pi 的请求失败不抛错而是 stopReason=error，这里统一转成失败原因。
 */
export async function verifyProviderKey(
  setting: LLMProviderSetting,
  modelId: string,
  signal?: AbortSignal
): Promise<{ ok: true } | { ok: false; error: string }> {
  const models = createModels();
  models.setProvider(await buildPiProvider(setting));
  const model = models.getModel(setting.id, modelId);
  if (!model) return { ok: false, error: `模型未注册：${modelId}` };
  try {
    const message = await models.completeSimple(
      model,
      { messages: [{ role: "user", content: "Hello", timestamp: Date.now() }] },
      { maxTokens: 16, ...(signal ? { signal } : {}) }
    );
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      return { ok: false, error: message.errorMessage || "请求失败" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 单发请求上下文组装（类型见 types/pi-llm.ts，两端共享）；assistant 历史为回放消息，usage 置零 */
export function buildSingleShotContext(
  request: PiSingleShotRequest,
  providerId: string,
  modelId: string
): Context {
  const messages: Message[] = request.messages.map(m =>
    m.role === "user"
      ? { role: "user", content: m.content, timestamp: Date.now() }
      : {
          role: "assistant",
          content: [{ type: "text", text: m.content }],
          api: "openai-completions" as Api,
          provider: providerId,
          model: modelId,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        }
  );
  return { systemPrompt: request.system, messages };
}
