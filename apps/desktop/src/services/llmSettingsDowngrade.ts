/**
 * 临时桥（M2-d 批次 1 引入，M2-e 随 chatStreamCore 内部切 pi 一并删除）：
 * v2 设置（pi 对齐）现场转旧 ProviderConfig/ModelConfig 喂尚未退役的 DesktopModelProtocolAdapter。
 * 只做数据形状映射，不承担语义兜底；升级 pi 或切 pi 路径后本文件整体删除。
 */
import type { ProviderConfig, ModelConfig, MessageFormat, LLMApiProtocol } from "@/types/llm";
import type { LLMModelSetting, LLMProviderSetting, PiApiKind } from "@/types/pi-llm";

const API_TO_LEGACY: Record<
  PiApiKind,
  { messageFormat: MessageFormat; apiProtocol: LLMApiProtocol }
> = {
  "openai-completions": { messageFormat: "openai", apiProtocol: "chat-completions" },
  "openai-responses": { messageFormat: "openai", apiProtocol: "responses" },
  "anthropic-messages": { messageFormat: "claude", apiProtocol: "chat-completions" },
};

export function downgradeModel(model: LLMModelSetting, provider: LLMProviderSetting): ModelConfig {
  const legacy = API_TO_LEGACY[provider.api];
  const legacyModel: ModelConfig = {
    name: model.id,
    description: model.name && model.name !== model.id ? model.name : "",
    features: {
      online: false,
      thinking: model.reasoning,
      image: model.input.includes("image"),
      video: false,
      audio: false,
      file: false,
    },
    messageFormat: legacy.messageFormat,
    apiProtocol: legacy.apiProtocol,
    maxOutputTokens: model.maxTokens,
    contextWindowK: model.contextWindow ? Math.round(model.contextWindow / 1024) : undefined,
  };
  const temperature = model.samplingParams?.temperature;
  if (typeof temperature === "number") legacyModel.temperature = temperature;
  if (model.headers?.["User-Agent"]) legacyModel.userAgent = model.headers["User-Agent"];
  return legacyModel;
}

export function downgradeProvider(provider: LLMProviderSetting): ProviderConfig {
  return {
    id: provider.id,
    name: provider.name,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    models: provider.models.map(model => downgradeModel(model, provider)),
  };
}
