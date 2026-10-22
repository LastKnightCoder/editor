/** 能力版本表示接口可用性，不代表业务数据授权。 */
export const PLUGIN_CAPABILITIES = [
  "commands.v1",
  "storage.v1",
  "pages.v1",
  "navigation.v1",
  "settings.v1",
  "ui.dialog.v1",
  "editor.elements.v1",
  "editor.codecs.v1",
  "editor.source.v1",
] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export function isPluginCapability(value: unknown): value is PluginCapability {
  return typeof value === "string" && PLUGIN_CAPABILITIES.some(capability => capability === value);
}

export function readPluginCapabilities(value: unknown): readonly PluginCapability[] {
  if (
    !Array.isArray(value) ||
    value.some(item => !isPluginCapability(item)) ||
    new Set(value).size !== value.length
  )
    throw new Error("能力列表包含未知能力或重复项");
  return Object.freeze([...value]);
}
