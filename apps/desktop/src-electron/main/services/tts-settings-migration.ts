import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

type Settings = Record<string, unknown>;
const record = (value: unknown): Settings =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Settings) : {};

/** 只转换旧设置，不安装插件或改变插件启用意图。 */
export async function migrateTTSSettings(
  setting: Settings,
  appDir: string,
  save: (next: Settings) => Promise<void>
): Promise<Settings> {
  const integration = record(setting.integration);
  const misc = record(setting.misc);
  const providers = Array.isArray(setting.ttsProviders) ? setting.ttsProviders : [];
  const hasLegacy = providers.some(value => Object.hasOwn(record(value), "providerType"));
  if (
    !hasLegacy &&
    !Object.hasOwn(integration, "minimax") &&
    !Object.hasOwn(integration, "podcastTTS") &&
    !Object.hasOwn(record(misc.tts), "providersMigrated")
  )
    return setting;

  // 备份使用独立文件名，失败重试也不会覆盖最初的原始配置。
  await writeFile(
    join(appDir, `setting.json.tts-${randomUUID()}.bak`),
    JSON.stringify(setting, null, 2),
    { flag: "wx", mode: 0o600 }
  );
  const migrated = providers.map(value => {
    const provider = record(value);
    if (typeof provider.pluginId === "string") {
      if (!Object.hasOwn(provider, "providerType")) return value;
      const { providerType: _type, apiKey: _key, baseUrl: _url, ...current } = provider;
      return current;
    }
    const pluginId =
      provider.providerType === "minimax"
        ? "tau.tts-minimax"
        : provider.providerType === "qwen"
          ? "tau.tts-qwen"
          : null;
    if (!pluginId) throw new Error("发现无法迁移的旧语音服务商，原设置已备份，请检查语音账号配置");
    const { providerType: _type, apiKey, baseUrl, ...rest } = provider;
    return { ...rest, pluginId, config: { apiKey, ...(baseUrl !== undefined ? { baseUrl } : {}) } };
  });
  const next = { ...setting };
  const legacyMinimax = record(integration.minimax);
  if (
    !providers.length &&
    record(misc.tts).providersMigrated !== true &&
    typeof legacyMinimax.apiKey === "string" &&
    legacyMinimax.apiKey.trim()
  ) {
    const podcast = record(integration.podcastTTS);
    const modelId =
      typeof podcast.minimaxModel === "string" && podcast.minimaxModel
        ? podcast.minimaxModel
        : "speech-2.8-hd";
    const models = [
      modelId,
      ...["speech-2.8-hd", "speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo"].filter(
        id => id !== modelId
      ),
    ];
    migrated.push({
      id: "minimax-legacy",
      name: "Minimax",
      pluginId: "tau.tts-minimax",
      config: { apiKey: legacyMinimax.apiKey },
      models: models.map(id => ({ id })),
    });
    next.ttsUsageSettings = {
      ...record(setting.ttsUsageSettings),
      default: { providerId: "minimax-legacy", modelId, voiceId: podcast.currentVoiceId ?? "" },
    };
  }
  next.ttsProviders = migrated;
  if (Object.hasOwn(setting, "integration")) {
    const cleaned = { ...integration };
    delete cleaned.minimax;
    delete cleaned.podcastTTS;
    next.integration = cleaned;
  }
  if (Object.hasOwn(misc, "tts")) {
    const tts = { ...record(misc.tts) };
    delete tts.providersMigrated;
    const cleaned = { ...misc };
    if (Object.keys(tts).length) cleaned.tts = tts;
    else delete cleaned.tts;
    next.misc = cleaned;
  }
  await save(next);
  return next;
}
