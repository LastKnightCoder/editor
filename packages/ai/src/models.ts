/**
 * LLM 设置模型 v2：字段与语义对齐 pi agent（@earendil-works/pi-ai）。
 * provider = createProvider 的直接输入；model 字段映射 pi Model 元数据
 * （samplingParams 承载 temperature、headers 承载自定义 User-Agent）。
 */

import type { ThinkingLevel } from "@tau/shared/chat-core";

/** pi 的线协议实现（原 messageFormat × apiProtocol 二维组合的收敛） */
export type PiApiKind = "openai-completions" | "openai-responses" | "anthropic-messages";

/**
 * 思考档位（off + 六档），与 pi 的 ThinkingLevel 逐项对齐。
 * 唯一定义在 @tau/shared（输入框组件也要用，且那边不能依赖 pi 包），
 * 此处只是桌面端沿用的名字——不是另一套取值。
 */
export type PiThinkingLevel = ThinkingLevel;

/**
 * pi 内置服务商目录项（主进程查询、渲染端只读）。
 * 目录里有 10 种 api，只暴露本项目支持的三种（PiApiKind）能命中的服务商与模型，
 * 否则界面会让用户建出跑不起来的服务商。
 */
export interface PiCatalogProvider {
  /** 内置服务商 id，写入 LLMProviderSetting.builtin */
  id: string;
  name: string;
  /** 官方 baseUrl；网关类服务商（Cloudflare/OpenCode 等）没有，需用户自填 */
  baseUrl?: string;
  /** 服务商级 api 兜底：取其可用模型里占多数的那种 */
  api: PiApiKind;
  /** 该服务商下受支持的模型数 */
  modelCount: number;
}

/** pi 内置目录的模型元数据（勾选模型时带入设置，免手填） */
export interface PiCatalogModel {
  id: string;
  name: string;
  api: PiApiKind;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  /** 每百万 token 价格（美元），用于界面提示与默认单价；无价格信息时为空 */
  cost?: LLMModelCost;
  /** 该模型真实支持的推理档位（pi getSupportedThinkingLevels），空数组表示不支持推理 */
  thinkingLevels: PiThinkingLevel[];
}

/**
 * 从服务商 `/models` 接口实时拉到的模型（M3-f）：覆盖目录外的自建服务（Ollama/LM Studio/私有网关）
 * 与目录落后于服务商新模型的情况。目录命中时元数据取目录（fromCatalog=true，与勾选目录同等可信）；
 * 否则只有接口自报的字段，缺的保持为空，不瞎猜默认值。
 */
export interface PiDiscoveredModel {
  id: string;
  name: string;
  fromCatalog: boolean;
  api?: PiApiKind;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: LLMModelCost;
}

/** 模型单价：每百万 token（美元）；缓存单价缺省按 0 计 */
export interface LLMModelCost {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface LLMModelSetting {
  /** 请求体里的 model 名，provider 内唯一 */
  id: string;
  /** 展示名，缺省同 id */
  name?: string;
  /** 是否支持推理输出（原 features.thinking） */
  reasoning: boolean;
  /** 输入模态（原 features.image / legacy multimodal 归并为 image） */
  input: ("text" | "image")[];
  /** 上下文窗口，单位 token；builtin 服务商由 pi 目录提供，仅自定义模型需要填 */
  contextWindow?: number;
  /** 最大输出 token；builtin 服务商由 pi 目录提供，仅自定义模型需要填 */
  maxTokens?: number;
  /** 推理力度档位，缺省交给 pi 按模型能力取默认 */
  thinkingLevel?: PiThinkingLevel;
  /**
   * 该模型的线协议。目录命中时以目录为准，此字段是目录不可用时的兜底——
   * 混合 api 的服务商（OpenRouter 同时有 anthropic-messages 与 openai-completions 模型）
   * 光靠服务商级 api 会落到错误协议。从目录勾选模型时记下，手填模型可留空。
   */
  api?: PiApiKind;
  /** 采样参数直通 pi StreamOptions.samplingParams（temperature 等） */
  samplingParams?: Record<string, unknown>;
  /** 请求头覆盖（原 userAgent → headers["User-Agent"]） */
  headers?: Record<string, string>;
  /** OpenAI 兼容网关调谐标志（thinkingFormat / maxTokensField 等），未设项由 pi 按 baseUrl 自动推断 */
  compat?: Record<string, unknown>;
  /**
   * 兜底开关：剥离混在 content 正文里的 <think>...</think> 标签（裸 vLLM/SGLang 等未开
   * reasoning-parser 的端点）。默认关——正文合法出现标签字样会被误切；结构化
   * reasoning_content 字段由 pi 原生处理，与本开关无关
   */
  stripThinkTags?: boolean;
  /**
   * 自定义单价，优先于内置目录价格（代理折扣、目录未收录的模型）。
   * 从目录勾选模型时默认填入目录价格；缺省时回落目录价格。
   */
  cost?: LLMModelCost;
}

export interface LLMProviderSetting {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  api: PiApiKind;
  /** 对应 pi 内置服务商 id（如 deepseek/anthropic）：模型元数据（上下文/输出/推理档位/compat/单价）
   *  以目录为准，用户手填仅作目录未收录模型的兜底；缺省时主进程按 baseUrl 匹配内置目录推断 */
  builtin?: string;
  models: LLMModelSetting[];
}

/** 按功能分配模型（原 LLMUsageConfig，model 主键从 name 改为 id） */
export interface LLMUsageConfigV2 {
  providerId: string;
  modelId: string;
}

import type { Api, Model } from "@earendil-works/pi-ai";
import { AiError, type AiModelRef } from "./contracts";
import {
  getBuiltinModels,
  getBuiltinProviders,
  type BuiltinProvider,
} from "@earendil-works/pi-ai/providers/all";
const isValidRate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** 模型设置里有有效的自定义单价（输入与输出都合法） */
export const hasCustomCost = (model: LLMModelSetting | undefined): boolean =>
  Boolean(model?.cost && isValidRate(model.cost.input) && isValidRate(model.cost.output));

/** 目录单价（每百万 token）；目录没有价格信息（输入输出都为 0）时为 undefined */
export function catalogCostOf(base: Model<Api> | undefined): LLMModelCost | undefined {
  if (!base?.cost || (!base.cost.input && !base.cost.output)) return undefined;
  return {
    input: base.cost.input,
    output: base.cost.output,
    cacheRead: base.cost.cacheRead,
    cacheWrite: base.cost.cacheWrite,
  };
}

/**
 * 设置里的单价是否真的是用户改过的价格：目录价自动填入的不算
 * （仍按目录计费，保留分档价，用量记录标为 catalog）。
 */
export function isCustomPriced(model: LLMModelSetting, catalog: LLMModelCost | undefined): boolean {
  if (!hasCustomCost(model)) return false;
  if (!catalog) return true;
  const cost = model.cost!;
  return (
    cost.input !== catalog.input ||
    cost.output !== catalog.output ||
    (cost.cacheRead ?? 0) !== (catalog.cacheRead ?? 0) ||
    (cost.cacheWrite ?? 0) !== (catalog.cacheWrite ?? 0)
  );
}

/**
 * 单价：用户自定义优先（代理折扣、目录外模型），否则用目录价格。
 * 自定义时不继承目录的分档价（tiers）——用户填的是一口价；与目录价相同则仍用目录（含分档）。
 */
export function resolveModelCost(model: LLMModelSetting, base?: Model<Api>): Model<Api>["cost"] {
  const custom = model.cost;
  if (custom && isCustomPriced(model, catalogCostOf(base))) {
    return {
      input: custom.input,
      output: custom.output,
      cacheRead: isValidRate(custom.cacheRead) ? custom.cacheRead : 0,
      cacheWrite: isValidRate(custom.cacheWrite) ? custom.cacheWrite : 0,
    };
  }
  return base?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

/** 内置目录基底：命中时目录值权威（含 compat/thinkingLevelMap），用户手填仅兜底未收录键；单价例外，用户自定义优先 */
export function toPiModel(
  model: LLMModelSetting,
  provider: Pick<LLMProviderSetting, "id" | "baseUrl" | "api">,
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
    cost: resolveModelCost(model, base),
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

/** configured 仅表示已填写密钥；无密钥网关仍可调用。 */
export type AiPublicProvider = Omit<LLMProviderSetting, "apiKey"> & { configured?: boolean };

export interface AiModelConfig {
  llmProviders: AiPublicProvider[];
  llmUsageSettings: Record<string, LLMUsageConfigV2>;
}

const supportedApis = new Set<PiApiKind>([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
]);

export function findBuiltinModel(
  provider: AiPublicProvider,
  modelId: string
): Model<Api> | undefined {
  const names = getBuiltinProviders();
  const id =
    provider.builtin ??
    names.find(name =>
      getBuiltinModels(name).some(
        model =>
          model.baseUrl.replace(/\/+$/, "").toLowerCase() ===
          provider.baseUrl.replace(/\/+$/, "").toLowerCase()
      )
    );
  if (!id || !names.includes(id as BuiltinProvider)) return undefined;
  return getBuiltinModels(id as BuiltinProvider).find(model => model.id === modelId);
}

export function resolveConfiguredModel(config: AiModelConfig, ref: AiModelRef) {
  const provider = config.llmProviders.find(item => item.id === ref.providerId);
  const setting = provider?.models.find(item => item.id === ref.modelId);
  if (!provider || !setting) throw new AiError("AI_MODEL_UNAVAILABLE", "所选模型未配置");
  let model: Model<Api>;
  try {
    model = toPiModel(setting, provider, findBuiltinModel(provider, setting.id));
  } catch (error) {
    throw new AiError(
      "AI_MODEL_METADATA_INCOMPLETE",
      error instanceof Error ? error.message : "模型容量不完整"
    );
  }
  if (!supportedApis.has(model.api as PiApiKind))
    throw new AiError("AI_MODEL_UNAVAILABLE", "当前宿主不支持该模型协议");
  return { provider: structuredClone(provider), setting: structuredClone(setting), model };
}
