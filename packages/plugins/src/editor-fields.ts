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
const PLUGIN_EXTENSION_FIELDS = new Set<PropertyKey>([
  ...OPEN_EXTENSION_FIELDS,
  "styleSources",
  "htmlSerializers",
]);

export type OpenEditorExtensionField = (typeof OPEN_EXTENSION_FIELDS)[number];

/**
 * 运行时按白名单校验插件给的编辑器扩展：编辑器装配直接读取属性，类型约束拦不住纯 JS 插件，
 * 继承或不可枚举的属性同样会被读到，所以要求普通对象且自有键全部开放。
 */
export function assertPluginEditorExtension(
  extension: unknown
): asserts extension is PluginEditorExtension {
  if (typeof extension !== "object" || extension === null) throw new Error("编辑器扩展必须是对象");
  const prototype = Object.getPrototypeOf(extension);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error("编辑器扩展必须是普通对象");
  if ("plugins" in extension) throw new Error("编辑器插件不支持原始 Slate 包装器");
  const closed = Reflect.ownKeys(extension).filter(key => !PLUGIN_EXTENSION_FIELDS.has(key));
  if (closed.length)
    throw new Error(`编辑器扩展含未开放的字段：${closed.map(key => String(key)).join("、")}`);
}
