import type { EditorExtension as InternalExtension } from "@tau/editor/contracts";
import type { PluginEditorExtension } from "./editor";

/** 向插件开放的编辑器扩展字段；类型与运行时校验共用这一份，新增开放须同时评估宿主隔离。 */
const OPEN_EXTENSION_FIELDS = [
  "id",
  "apiVersion",
  "elements",
  "commands",
  "hotkeys",
  "menu",
  "blockPanel",
  "behaviorsFor",
] as const satisfies readonly (keyof InternalExtension)[];
const PLUGIN_EXTENSION_FIELDS = [
  ...OPEN_EXTENSION_FIELDS,
  "styleSources",
  "htmlSerializers",
] as const;

export type OpenEditorExtensionField = (typeof OPEN_EXTENSION_FIELDS)[number];

/** 只把公开字段交给编辑器，避免私有内核钩子进入执行链路。 */
export function normalizePluginEditorExtension(extension: unknown): PluginEditorExtension {
  if (!extension || typeof extension !== "object" || Array.isArray(extension))
    throw new Error("编辑器扩展必须是对象");
  const source = extension as Record<string, unknown>;
  return Object.fromEntries(
    PLUGIN_EXTENSION_FIELDS.filter(key => source[key] !== undefined).map(key => [key, source[key]])
  ) as unknown as PluginEditorExtension;
}
