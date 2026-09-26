/**
 * pi-ai 运行时核心（纯逻辑，无 Electron 依赖，可单测）：
 * 设置 v2（LLMProviderSetting）→ pi Provider/Model 的构建、provider 注册表同步、单发请求组装。
 * 模块壳（IPC/设置订阅）在 pi-ai-runtime.ts。
 */
import * as anthropicMessagesApi from "@earendil-works/pi-ai/api/anthropic-messages";
import * as openAICompletionsApi from "@earendil-works/pi-ai/api/openai-completions";
import * as openAIResponsesApi from "@earendil-works/pi-ai/api/openai-responses";
import { createModels, createProvider } from "@earendil-works/pi-ai";
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
  PiSingleShotRequest,
} from "@/types/pi-llm";

const API_STREAMS: Record<PiApiKind, ProviderStreams> = {
  "openai-completions": openAICompletionsApi,
  "openai-responses": openAIResponsesApi,
  "anthropic-messages": anthropicMessagesApi,
};

export function toPiModel(model: LLMModelSetting, provider: LLMProviderSetting): Model<Api> {
  const piModel: Model<Api> = {
    id: model.id,
    name: model.name ?? model.id,
    api: provider.api,
    provider: provider.id,
    baseUrl: provider.baseUrl,
    reasoning: model.reasoning,
    input: model.input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
  if (model.samplingParams) piModel.samplingParams = model.samplingParams;
  if (model.headers) piModel.headers = model.headers;
  if (model.compat) piModel.compat = model.compat as never;
  return piModel;
}

/** 设置 v2 → pi Provider；apiKey 从设置内存值经 auth resolve 注入（BYO 网关模式） */
export function buildPiProvider(setting: LLMProviderSetting): Provider {
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
    models: setting.models.map(m => toPiModel(m, setting)),
    api: API_STREAMS[setting.api],
  });
}

export interface ProviderRegistry {
  readonly models: MutableModels;
  /** 全量同步设置里的 provider 列表：新增/变更 upsert，移除 delete */
  syncProviders(settings: LLMProviderSetting[]): void;
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
    syncProviders(settings) {
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
        models.setProvider(buildPiProvider(setting));
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
