type Settings = Record<string, unknown>;

function record(value: unknown, field: string): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`SETTING_INVALID: ${field} 必须是对象`);
  return value as Settings;
}

/** 读取和提交使用同一边界，旧账号配置不自动转换或覆盖。 */
export function assertCurrentProviderSettings(value: unknown): asserts value is Settings {
  const setting = record(value, "设置");
  if (Object.hasOwn(setting, "embeddingProvider"))
    throw new Error("SETTING_INVALID: 旧嵌入配置不受支持，请在「设置 → 向量模型」重新启用模型");
  const integration =
    setting.integration === undefined ? {} : record(setting.integration, "integration");
  if (
    ["github", "s3", "aliOSS", "webdav", "minimax", "podcastTTS", "bilibili", "youtube"].some(key =>
      Object.hasOwn(integration, key)
    )
  )
    throw new Error("SETTING_INVALID: 旧服务账号配置不受支持，请在插件设置中重新配置");

  for (const group of ["sync", "imageBed", "publish"] as const) {
    if (setting[group] === undefined) continue;
    const section = record(setting[group], group);
    if (
      (section.active !== undefined &&
        section.active !== "plugin" &&
        !(group !== "sync" && section.active === "local")) ||
      ["github", "s3", "aliOSS", "webdav", "githubCdn"].some(key => Object.hasOwn(section, key))
    )
      throw new Error(`SETTING_INVALID: ${group} 不支持旧服务配置，请重新配置`);
  }

  const imageGeneration =
    setting.imageGeneration === undefined ? {} : record(setting.imageGeneration, "imageGeneration");
  for (const [field, value] of [
    ["ttsProviders", setting.ttsProviders],
    ["imageGeneration.providers", imageGeneration.providers],
  ] as const) {
    if (value === undefined) continue;
    if (!Array.isArray(value)) throw new Error(`SETTING_INVALID: ${field} 必须是数组`);
    for (const item of value) {
      const provider = record(item, field);
      if (
        typeof provider.pluginId !== "string" ||
        !provider.pluginId.trim() ||
        Object.hasOwn(provider, "providerType")
      )
        throw new Error(`SETTING_INVALID: ${field} 只支持插件账号，请重新配置`);
    }
  }
}
