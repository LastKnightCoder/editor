import type { PluginContext, PluginSettingsDefinition } from "@tau/plugins";
import type { MobilePluginRuntime } from "../../../app/plugins/runtime";
import type { SettingCompat, TTSProviderSetting, TTSUsageConfig } from "../../../types";

export type TtsProviderEntry = {
  id: string;
  context: PluginContext;
  definition: PluginSettingsDefinition;
};

const EMPTY_ACCOUNTS: TTSProviderSetting[] = [];

export function listTtsProviders(runtime: MobilePluginRuntime | null): TtsProviderEntry[] {
  if (!runtime) return [];
  return [...runtime.settings.entries()]
    .filter(([, entry]) => entry.definition.target === "tts" && runtime.active(entry.context))
    .map(([id, entry]) => ({ id, ...entry }));
}

export function getTtsAccounts(setting: SettingCompat | null): TTSProviderSetting[] {
  return setting?.ttsProviders ?? EMPTY_ACCOUNTS;
}

export function getTtsUsage(setting: SettingCompat | null): TTSUsageConfig | null {
  return setting?.ttsUsageSettings?.default ?? null;
}

export function findTtsAccount(
  setting: SettingCompat | null,
  instanceId: string | undefined
): TTSProviderSetting | undefined {
  if (!instanceId) return undefined;
  return getTtsAccounts(setting).find(account => account.id === instanceId);
}

export function resolveTtsModel(
  account: TTSProviderSetting | undefined,
  usage: TTSUsageConfig | null,
  requested?: string
): string {
  if (!account) return "";
  if (requested && account.models.some(model => model.id === requested)) return requested;
  if (
    usage?.providerId === account.id &&
    account.models.some(model => model.id === usage.modelId)
  ) {
    return usage.modelId;
  }
  return account.models[0]?.id ?? "";
}

export function resolveTtsVoice(
  account: TTSProviderSetting | undefined,
  usage: TTSUsageConfig | null,
  modelId: string,
  requested?: string
): string {
  if (requested !== undefined) return requested;
  if (account && usage?.providerId === account.id && usage.modelId === modelId) {
    return usage.voiceId;
  }
  return "";
}

export function selectionForAccount(
  account: TTSProviderSetting,
  usage: TTSUsageConfig | null,
  modelId = resolveTtsModel(account, usage)
): TTSUsageConfig {
  return {
    providerId: account.id,
    modelId,
    voiceId: usage?.providerId === account.id && usage.modelId === modelId ? usage.voiceId : "",
  };
}
