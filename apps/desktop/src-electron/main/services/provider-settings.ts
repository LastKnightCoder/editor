type Settings = Record<string, unknown>;

function record(value: unknown, field: string): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`SETTING_INVALID: ${field} 必须是对象`);
  return value as Settings;
}

/** 只校验结构，未使用的服务字段不影响设置读取和保存。 */
export function assertProviderSettingsShape(value: unknown): asserts value is Settings {
  const setting = record(value, "设置");
  for (const group of ["integration", "sync", "imageBed", "publish"] as const) {
    if (setting[group] === undefined) continue;
    record(setting[group], group);
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
      record(item, field);
    }
  }
}
