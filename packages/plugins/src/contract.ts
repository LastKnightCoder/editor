import type { PluginPages } from "./pages";
import type { PluginEnvironment } from "./environment";
import type { PluginNavigation } from "./navigation";
import type { PluginAI, PluginAIFeature } from "./ai";
import type { WhiteboardExtension } from "./whiteboard";
import type { PluginServices } from "./services";
import type { PluginEditor } from "./editor";
import type { PluginEditorExtension } from "./editor";
import type { ContentMetricRule } from "@tau/db-schema/content-metrics";
import type { MarkdownCodec } from "@tau/markdown";
import type { PluginSettings } from "./settings";
import type { PluginSync } from "./sync";
import type { PluginUpload } from "./upload";
import type { PluginTTS } from "./tts";
import type { PluginASR } from "./asr";
import type { PluginWebSocket } from "./websocket";
import type { PluginImages } from "./images";
import type { PluginEmbeddings } from "./embeddings";
import type { PluginVideo } from "./video";
import type { PluginPublish } from "./publish";
import type { PluginSidebar } from "./sidebar";
import type { PluginHome } from "./home";
import type { PluginActions } from "./actions";
import type { PluginViews } from "./views";
import type { PluginExcerpts, PluginMaterials } from "./excerpts";
import type { PluginMCP } from "./mcp";
import type { PluginChat } from "./chat";
import type { PluginBackendClient } from "./backend";
import type { PluginPermissions } from "./permissions";
import type { PluginContent, PluginData } from "./data";
import type { PluginEvents } from "./events";
import type { PluginApp } from "./app";
import type { PluginOwnEntities } from "./entities";
import type { PluginRecords } from "./records";
import type { PluginLinks } from "./links";
import type { PluginTransactionRunner } from "./transaction";
import type { PluginFlashcards } from "./flashcards";
import type { PluginNotifications } from "./notifications";

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
  readonly environment: PluginEnvironment;
  readonly navigation: PluginNavigation;
  readonly backend: PluginBackendClient;
  readonly pluginId: string;
  readonly workspaceId: string;
  readonly signal: AbortSignal;
  readonly commands: { register(command: PluginCommand): Disposable };
  readonly storage: PluginStorage;
  readonly pages: PluginPages;
  readonly editor: PluginEditor;
  readonly settings: PluginSettings;
  readonly sync: PluginSync;
  readonly upload: PluginUpload;
  readonly tts: PluginTTS;
  readonly asr: PluginASR;
  readonly websocket: PluginWebSocket;
  readonly images: PluginImages;
  /** API 嵌入提供方：渲染进程内实现，主进程经 relay 调用 */
  readonly embeddings: PluginEmbeddings;
  readonly video: PluginVideo;
  readonly publish: PluginPublish;
  readonly sidebar: PluginSidebar;
  /** 首页面板 */
  readonly home: PluginHome;
  /** 对象动作：卡片、文章、项目文档「⋯」菜单里的条目 */
  readonly actions: PluginActions;
  /** 卡片、文章、项目文档详情里的区块 */
  readonly views: PluginViews;
  readonly excerpts: PluginExcerpts;
  readonly materials: PluginMaterials;
  readonly fetch: typeof globalThis.fetch;
  readonly services: PluginServices;
  readonly ai: PluginAI;
  readonly mcp: PluginMCP;
  readonly chat: PluginChat;
  /** 业务数据权限的查询与申请；数据接口首次调用时也会自动申请 */
  readonly permissions: PluginPermissions;
  /** 卡片、文章、项目文档、待办与日程的只读访问 */
  readonly data: PluginData;
  /** 按 ContentRef 读取正文 */
  readonly content: PluginContent;
  /** 业务数据变更事件，如卡片更新 */
  readonly events: PluginEvents;
  /** 选择与打开已有内容 */
  readonly app: PluginApp;
  /** 插件自建、各带一份正文的内容；读写自己的内容不需要业务数据权限 */
  readonly entities: PluginOwnEntities;
  /** 插件内部使用的结构化数据；读写自己的记录不需要业务数据权限 */
  readonly records: PluginRecords;
  /** 从本插件的内容指向其他内容的有序关联，显示在目标的脉络里 */
  readonly links: PluginLinks;
  /** 把对本插件内容、记录与关联的多条写入作为一个整体提交：全部生效或全部不生效 */
  readonly transaction: PluginTransactionRunner;
  readonly flashcards: PluginFlashcards;
  readonly notifications: PluginNotifications;
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
  /** 可序列化的统计字段，与 Markdown 转换独立；不执行插件回调。 */
  readonly editorMetrics?: readonly ContentMetricRule[];
  readonly ai?: { readonly features: readonly PluginAIFeature[] };
  /** 每次启用创建新实例，运行状态不放在定义对象上。 */
  create(): PluginInstance;
}
