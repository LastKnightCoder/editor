/**
 * LLM 设置一次性转化：旧 ProviderConfig/ModelConfig（messageFormat × apiProtocol 二维适配）
 * → v2 LLMProviderSetting/LLMModelSetting（对齐 pi 的 api 单字段 + Model 元数据）。
 * 挂载在 useSettingStore 的 mergeSettingWithDefaults，转化后删除旧 llmConfigs，不留兼容层。
 */
import type {
  LLMUsageConfig,
  MessageFormat,
  LLMApiProtocol,
  ModelConfig,
  ProviderConfig,
} from "@/types/llm";
import type {
  LLMModelSetting,
  LLMProviderSetting,
  LLMUsageConfigV2,
  PiApiKind,
} from "@/types/pi-llm";

/** messageFormat × apiProtocol → pi 线协议 */
const API_KIND_TABLE: Record<string, PiApiKind> = {
  "openai|chat-completions": "openai-completions",
  "openai|responses": "openai-responses",
  "claude|chat-completions": "anthropic-messages",
  "claude|responses": "anthropic-messages",
};

export interface LlmSettingsV2MigrationReport {
  /** 转化的 provider / model 数量 */
  providerCount: number;
  modelCount: number;
  /** 与 provider 主格式不一致、被跳过的模型（name + 差异描述） */
  skippedModels: { providerId: string; modelName: string; reason: string }[];
  /** 无指向（provider 或 model 已不存在）而被丢弃的功能槽位 */
  droppedUsageKeys: string[];
}

export interface LlmSettingsV2MigrationResult {
  providers: LLMProviderSetting[];
  usage: Record<string, LLMUsageConfigV2>;
  report: LlmSettingsV2MigrationReport;
}

const inferApiKind = (models: ModelConfig[]): PiApiKind => {
  const explicit = models.find(m => m.messageFormat);
  const format: MessageFormat = explicit?.messageFormat ?? "openai";
  const protocol: LLMApiProtocol = explicit?.apiProtocol ?? "chat-completions";
  return API_KIND_TABLE[`${format}|${protocol}`] ?? "openai-completions";
};

const toModelSetting = (model: ModelConfig): LLMModelSetting => {
  const setting: LLMModelSetting = {
    id: model.name,
    reasoning: model.features?.thinking ?? false,
    // 图片模态默认放开：旧体系 features.image 只是展示标注、运行时从不 gate（普遍缺勾），
    // 而 pi 的 model.input 是硬闸门——不支持图片的模型放开后由网关显式报错，可诊断性远好于静默省略；
    // 精确能力以设置页（M2-d）手动校正
    input: ["text", "image"],
    ...(model.contextWindowK ? { contextWindow: model.contextWindowK * 1024 } : {}),
    ...(model.maxOutputTokens ? { maxTokens: model.maxOutputTokens } : {}),
  };
  if (model.temperature !== undefined) setting.samplingParams = { temperature: model.temperature };
  if (model.userAgent) setting.headers = { "User-Agent": model.userAgent };
  // claude 线协议下的 maxTokens 语义与旧 maxOutputTokens 一致，无需 compat 特判
  return setting;
};

export function migrateLlmSettingsToV2(input: {
  llmConfigs: ProviderConfig[];
  llmUsageSettings: Record<string, LLMUsageConfig>;
}): LlmSettingsV2MigrationResult {
  const report: LlmSettingsV2MigrationReport = {
    providerCount: 0,
    modelCount: 0,
    skippedModels: [],
    droppedUsageKeys: [],
  };
  const providers: LLMProviderSetting[] = [];

  for (const provider of input.llmConfigs ?? []) {
    const api = inferApiKind(provider.models ?? []);
    const models: LLMModelSetting[] = [];
    for (const model of provider.models ?? []) {
      const modelApi = model.messageFormat
        ? (API_KIND_TABLE[`${model.messageFormat}|${model.apiProtocol ?? "chat-completions"}`] ??
          "openai-completions")
        : api;
      if (modelApi !== api) {
        report.skippedModels.push({
          providerId: provider.id,
          modelName: model.name,
          reason: `模型协议 ${modelApi} 与 provider 主协议 ${api} 不一致`,
        });
        continue;
      }
      models.push(toModelSetting(model));
    }
    providers.push({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      api,
      models,
    });
    report.providerCount += 1;
    report.modelCount += models.length;
  }

  const modelIndex = new Map<string, Set<string>>();
  for (const p of providers) modelIndex.set(p.id, new Set(p.models.map(m => m.id)));

  const usage: Record<string, LLMUsageConfigV2> = {};
  for (const [key, slot] of Object.entries(input.llmUsageSettings ?? {})) {
    // 旧 LLMUsageConfig.modelName 与 v2 model.id 同源（都是请求体 model 名），直接改主键名
    if (slot && modelIndex.get(slot.providerId)?.has(slot.modelName)) {
      usage[key] = { providerId: slot.providerId, modelId: slot.modelName };
    } else {
      report.droppedUsageKeys.push(key);
    }
  }

  return { providers, usage, report };
}
