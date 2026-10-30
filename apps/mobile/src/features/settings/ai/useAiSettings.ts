import { useCallback } from "react";
import { useAppContext } from "../../../app/AppContext";
import { mergeAiSettings, writeAiSettings } from "../../../services/ai-settings";
import type { AiSettingsMutation, MobileLlmProvider } from "../../../types";

/** AI 设置页共用：读取当前快照，写入经原生串行命令并把返回快照并回应用设置 */
export function useAiSettings() {
  const app = useAppContext();
  const setting = app.syncSettings.safeSetting;
  const providers: MobileLlmProvider[] = setting?.llmProviders ?? [];
  const usage = setting?.llmUsageSettings ?? {};
  const { updateSetting } = app.syncSettings;
  const mutate = useCallback(
    async (mutation: AiSettingsMutation) => {
      const snapshot = await writeAiSettings(mutation);
      updateSetting(previous => mergeAiSettings(previous, snapshot));
      return snapshot;
    },
    [updateSetting]
  );
  return { setting, providers, usage, mutate, databaseName: setting?.database?.active ?? "" };
}

export function providerLetter(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "A";
}

const TILE_TONES = [
  "bg-tag-2-soft text-tag-2",
  "bg-tag-3-soft text-tag-3",
  "bg-tag-4-soft text-tag-4",
  "bg-tag-1-soft text-tag-1",
  "bg-tag-5-soft text-tag-5",
] as const;

/** 按服务商 id 派生字母块色调，同一服务商始终同色 */
export function providerTone(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILE_TONES[hash % TILE_TONES.length];
}

export function providerSummary(provider: MobileLlmProvider) {
  const count = `${provider.models.length} 个模型`;
  if (!provider.configured) return `${count} · 填写 Key 后可用`;
  return provider.keyHint ? `${count} · …${provider.keyHint}` : count;
}
