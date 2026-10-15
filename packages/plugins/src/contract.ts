import type { PluginPages } from "./pages";
import type { PluginEditor } from "./editor";
import type { PluginSettings } from "./settings";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface PluginStorage {
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PluginCommand {
  /** 插件内的局部 ID，宿主会添加插件命名空间。 */
  id: string;
  title: string;
  run(input: JsonValue): JsonValue | Promise<JsonValue>;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly workspaceId: string;
  readonly signal: AbortSignal;
  readonly commands: { register(command: PluginCommand): Disposable };
  readonly storage: PluginStorage;
  readonly pages: PluginPages;
  readonly editor: PluginEditor;
  readonly settings: PluginSettings;
  readonly fetch: typeof globalThis.fetch;
  /** 将订阅等资源交给宿主，在停用或激活失败时逆序回收。 */
  register(resource: Disposable): Disposable;
}

export interface PluginInstance {
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface PluginDefinition {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: 1;
  /** 每次启用创建新实例，运行状态不放在定义对象上。 */
  create(): PluginInstance;
}
