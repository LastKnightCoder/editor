/** 功能名只表示是否可用；接口升级由 SDK 和最低客户端版本管理。 */
export const PLUGIN_CAPABILITIES = [
  "commands",
  "storage",
  "pages",
  "navigation",
  "settings",
  "dialogs",
  "editor",
  "editorCodecs",
  "sourceEditor",
  "runtimeStyles",
  "media",
] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

/** 保留分发清单原值，未知可选功能可读取但不能当作已实现功能。 */
export function readPluginCapabilityNames(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    [...value].some(
      item => typeof item !== "string" || item.length > 128 || !/^[a-z][a-zA-Z0-9]*$/.test(item)
    ) ||
    new Set(value).size !== value.length
  )
    throw new Error("能力列表包含无效名称、重复项或超出数量限制");
  return Object.freeze([...value]);
}

export function isPluginCapability(value: unknown): value is PluginCapability {
  return typeof value === "string" && PLUGIN_CAPABILITIES.some(capability => capability === value);
}

export function readPluginCapabilities(value: unknown): readonly PluginCapability[] {
  const names = readPluginCapabilityNames(value);
  if (!names.every(isPluginCapability)) throw new Error("能力列表包含未知能力");
  return names;
}
