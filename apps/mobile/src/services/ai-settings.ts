import type { LLMUsageConfigV2 } from "@tau/ai/models";
import type {
  AiSettingsMutation,
  AiSettingsSnapshot,
  LlmFeatureKey,
  MobileLlmProvider,
  SettingCompat,
} from "../types";
import { enqueueProviderConfigWrite } from "./provider-config";
import { mutateAiSettings } from "./tauri";

/** 设置页列出的功能分配，键与桌面 llmUsageSettings 一致 */
export const LLM_FEATURES: ReadonlyArray<{ key: LlmFeatureKey; label: string; desc: string }> = [
  { key: "chat", label: "对话", desc: "聊天、提问笔记、整理内容" },
  { key: "speechInputRefinement", label: "语音输入整理", desc: "识别后补标点、去口头禅" },
];

export function mergeAiSettings(
  previous: SettingCompat,
  snapshot: AiSettingsSnapshot
): SettingCompat {
  return {
    ...previous,
    llmProviders: snapshot.llmProviders,
    llmUsageSettings: snapshot.llmUsageSettings,
    speechInput: snapshot.speechInput ?? previous.speechInput,
  };
}

/** 原生按设置文件串行写入，与插件配置写入共用一条队列 */
export function writeAiSettings(mutation: AiSettingsMutation): Promise<AiSettingsSnapshot> {
  return enqueueProviderConfigWrite(() => mutateAiSettings(mutation));
}

export function findAssignedModel(
  setting: SettingCompat | null | undefined,
  feature: LlmFeatureKey
): { provider: MobileLlmProvider; model: MobileLlmProvider["models"][number] } | null {
  const usage = setting?.llmUsageSettings?.[feature];
  if (!usage) return null;
  const provider = setting?.llmProviders?.find(item => item.id === usage.providerId);
  const model = provider?.models.find(item => item.id === usage.modelId);
  return provider && model ? { provider, model } : null;
}

export const modelLabel = (model: { id: string; name?: string }) => model.name || model.id;

export function sameUsage(a: LLMUsageConfigV2 | null | undefined, b: LLMUsageConfigV2 | null) {
  return !!a && !!b && a.providerId === b.providerId && a.modelId === b.modelId;
}
