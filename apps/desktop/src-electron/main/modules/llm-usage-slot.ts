import type { LLMProviderSetting, LLMUsageConfigV2 } from "@/types/pi-llm";

/** 设置里分配给某功能槽的模型（llmUsageSettings 的 v2 形态） */
export interface LlmRef {
  providerId: string;
  modelId: string;
}

/** setting.json 里读功能槽所需的 v2 字段 */
export interface SettingForLlmSlots {
  llmProviders?: LLMProviderSetting[];
  llmUsageSettings?: Record<string, LLMUsageConfigV2 | null | undefined>;
}

/**
 * 主进程后台任务按功能槽取模型：槽未分配、或引用的服务商 / 模型已被删除时返回 null。
 * 实际请求经 pi-ai-runtime 的注册表发出，这里只做存在性校验。
 */
export function resolveUsageSlot(setting: SettingForLlmSlots, slot: string): LlmRef | null {
  const usage = setting.llmUsageSettings?.[slot];
  if (!usage?.providerId || !usage.modelId) return null;
  const provider = setting.llmProviders?.find(p => p.id === usage.providerId);
  if (!provider?.models.some(m => m.id === usage.modelId)) return null;
  return { providerId: usage.providerId, modelId: usage.modelId };
}
