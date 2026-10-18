import type { PluginPages } from "./pages";
import type { PluginSkill } from "./skills";
import type { PluginAI, PluginAIFeature } from "./ai";
import type { WhiteboardExtension } from "./whiteboard";
import type { PluginServices } from "./services";
import type { PluginEditor } from "./editor";
import type { PluginEditorExtension } from "./editor";
import type { MarkdownCodec } from "@tau/markdown";
import type { PluginSettings } from "./settings";
import type { PluginSync } from "./sync";
import type { PluginSidebar } from "./sidebar";
import type { PluginExcerpts, PluginMaterials } from "./excerpts";
import type { PluginMCP } from "./mcp";

import type { JsonValue } from "./json";
export type { JsonValue } from "./json";

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
  readonly sync: PluginSync;
  readonly sidebar: PluginSidebar;
  readonly excerpts: PluginExcerpts;
  readonly materials: PluginMaterials;
  readonly fetch: typeof globalThis.fetch;
  readonly services: PluginServices;
  readonly ai: PluginAI;
  readonly mcp: PluginMCP;
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
  /** 静态声明，桌面与博客均装配同一份扩展；模块加载不得依赖桌面激活。 */
  readonly editorExtensions?: readonly PluginEditorExtension[];
  readonly whiteboardExtensions?: readonly WhiteboardExtension[];
  readonly editorCodecs?: readonly MarkdownCodec[];
  readonly skills?: readonly PluginSkill[];
  readonly ai?: { readonly features: readonly PluginAIFeature[] };
  /** 每次启用创建新实例，运行状态不放在定义对象上。 */
  create(): PluginInstance;
}
