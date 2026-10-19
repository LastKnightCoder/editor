import type {
  Disposable,
  JsonValue,
  PluginCommand,
  PluginContext,
  PluginDefinition,
  PluginInstance,
  PluginEditorContribution,
  PluginSettingsDefinition,
  PluginSettingsHandle,
  PluginSidebarGroupDefinition,
  PluginSidebarGroupHandle,
  PluginSidebarItemDefinition,
  PluginExcerptChange,
  PluginExcerptEntry,
  PluginExcerptItem,
  PluginExcerptProviderDefinition,
  PluginExcerptSource,
  PluginExcerptSourceSummary,
  PluginExcerptSyncResult,
  PluginMaterialAction,
  PluginMaterialRef,
  PluginSkill,
  PluginStorage,
} from "./index";
import { assertLocalId, copyJson } from "./values";
import type { SyncProviderDefinition } from "./sync";
import type { UploadFile, UploadProviderDefinition } from "./upload";
import type { TTSProviderDefinition } from "./tts";
import type { ImageProviderDefinition } from "./images";
import type { PublishProviderDefinition } from "./publish";
export { copyJson } from "./values";
import { unavailableAI, type PluginAI, type PluginAIFeature } from "./ai";
import { bindPluginServices, type PluginServices } from "./services";
export { bindPluginServices } from "./services";
import {
  ACTIVATION_TIMEOUT_MS,
  CLEANUP_TIMEOUT_MS,
  LifecycleTimeoutError,
  waitForLifecycle,
} from "./lifecycle";
import { assertStorageActive, type StorageAdapter, type StorageScope } from "./storage";
import { normalizePageParams, type PluginPageDefinition, type PluginPageHandle } from "./pages";
import { snapshotMCPDefinition, snapshotMCPToolResult, type PluginMCPDefinition } from "./mcp";
import { snapshotToolRendererDefinition, type PluginToolRendererDefinition } from "./chat";
export { createMemoryStorage } from "./storage";
export type { StorageAdapter, StorageScope } from "./storage";
export { createBrowserStorage, clearBrowserPluginStorage } from "./browser-storage";
export { normalizePageParams } from "./pages";
export { validatePluginManifest, PLUGIN_SHARED_MODULES } from "./package";
export { comparePluginVersions, assertPluginCompatibility } from "./version";
export type { PluginManifest, DevelopmentPluginPackage } from "./package";

export interface PagesAdapter {
  register(context: PluginContext, definition: PluginPageDefinition): PluginPageHandle;
}

export interface EditorAdapter {
  register(context: PluginContext, contribution: PluginEditorContribution): Disposable;
}

export interface SettingsAdapter {
  register(context: PluginContext, definition: PluginSettingsDefinition): PluginSettingsHandle;
}

export interface SidebarAdapter {
  registerGroup(
    context: PluginContext,
    definition: PluginSidebarGroupDefinition
  ): PluginSidebarGroupHandle;
  registerItem(
    context: PluginContext,
    definition: PluginSidebarItemDefinition,
    pageId: string
  ): Disposable;
}

/** 宿主负责命名空间（来源类型即插件 ID）与工作区绑定；参数已复制为 JSON。 */
export interface ExcerptsAdapter {
  register(context: PluginContext, definition: PluginExcerptProviderDefinition): Disposable;
  replace(
    context: PluginContext,
    source: PluginExcerptSource,
    items: PluginExcerptItem[]
  ): Promise<PluginExcerptSyncResult>;
  patch(
    context: PluginContext,
    source: PluginExcerptSource,
    change: PluginExcerptChange
  ): Promise<PluginExcerptSyncResult>;
  sources(context: PluginContext): Promise<PluginExcerptSourceSummary[]>;
  items(context: PluginContext, sourceKey: string): Promise<PluginExcerptEntry[]>;
}

export interface MaterialsAdapter {
  actions(context: PluginContext, ref: PluginMaterialRef): Promise<PluginMaterialAction[]>;
}

export interface MCPAdapter {
  register(
    context: PluginContext,
    definition: PluginMCPDefinition,
    owner: PluginOwner & { executionIdentity: string }
  ): Disposable;
}

export interface ChatAdapter {
  prepare(
    context: PluginContext,
    definition: PluginToolRendererDefinition
  ): Promise<() => Disposable>;
}

export type PluginState =
  "disabled" | "activating" | "active" | "deactivating" | "failed" | "restart-required";

export interface CommandInfo {
  id: string;
  pluginId: string;
  pluginName: string;
  title: string;
}

/** 贡献的归属插件，供宿主展示来源。 */
export interface PluginOwner {
  id: string;
  name: string;
}

/** 插件激活后实际注册的贡献类别，供管理界面展示「此插件提供」。 */
export type PluginContributionKind =
  | "page"
  | "sidebar"
  | "command"
  | "settings"
  | "sync"
  | "upload"
  | "tts"
  | "images"
  | "publish"
  | "mcp"
  | "chat"
  | "skill"
  | "ai"
  | "editor"
  | "whiteboard"
  | "excerpts";

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  state: PluginState;
  error?: string;
}

interface Activation {
  context?: PluginContext;
  contributions: Map<PluginContributionKind, number>;
  ai?: PluginAI;
  controller: AbortController;
  resources: Disposable[];
  instance?: PluginInstance;
  onActivated: Array<() => void>;
  beforeActivated: Array<() => void>;
}

function tally(activation: Activation, kind: PluginContributionKind, delta: number) {
  if (delta) activation.contributions.set(kind, (activation.contributions.get(kind) ?? 0) + delta);
}

type PluginMetadata = Pick<PluginDefinition, "id" | "name" | "version" | "apiVersion">;
type DefinitionResolver = (signal: AbortSignal) => PluginDefinition | Promise<PluginDefinition>;

interface Entry {
  metadata: PluginMetadata;
  resolveDefinition: DefinitionResolver;
  state: PluginState;
  activation?: Activation;
  pending: Promise<void>;
  removing?: boolean;
  error?: string;
}

interface RegisteredCommand {
  info: CommandInfo;
  entry: Entry;
  activation: Activation;
  run: PluginCommand["run"];
}

/** 只接收宿主显式信任的代码；此宿主不提供第三方沙箱或授权界面。 */
export class PluginHost {
  private readonly entries = new Map<string, Entry>();
  private readonly commands = new Map<string, RegisteredCommand>();
  private closed = false;
  private disposal?: Promise<void>;
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  private readonly restartRequired: Set<string>;

  constructor(
    private readonly options: {
      workspaceId: string;
      storage: StorageAdapter;
      pages?: PagesAdapter;
      editor?: EditorAdapter;
      skills?: { register(plugin: PluginOwner, skill: PluginSkill): Disposable };
      ai?: {
        bind(
          plugin: PluginOwner,
          features: readonly PluginAIFeature[],
          signal: AbortSignal
        ): Promise<PluginAI>;
      };
      settings?: SettingsAdapter;
      publish?: {
        register(context: PluginContext, definition: PublishProviderDefinition): Disposable;
      };
      sync?: { register(context: PluginContext, definition: SyncProviderDefinition): Disposable };
      upload?: {
        register(context: PluginContext, definition: UploadProviderDefinition): Disposable;
        uploadRemote?(file: UploadFile, signal: AbortSignal): Promise<string>;
      };
      tts?: { register(context: PluginContext, definition: TTSProviderDefinition): Disposable };
      images?: {
        register(context: PluginContext, definition: ImageProviderDefinition): Disposable;
      };
      sidebar?: SidebarAdapter;
      excerpts?: ExcerptsAdapter;
      materials?: MaterialsAdapter;
      mcp?: MCPAdapter;
      chat?: ChatAdapter;
      fetch?: typeof globalThis.fetch;
      services?: PluginServices;
      /** 同一运行环境重建宿主时共享，避免旧副作用未结束就重启插件。 */
      restartRequired?: Set<string>;
    }
  ) {
    if (!options.workspaceId.trim()) throw new Error("插件宿主需要明确的工作区身份");
    this.options = Object.freeze({ ...options });
    this.restartRequired = options.restartRequired ?? new Set();
  }

  getRevision = (): number => this.revision;

  subscribe = (listener: () => void): (() => void) => {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  registerTrusted(definition: PluginDefinition): void {
    const snapshot = Object.freeze({ ...definition });
    this.register(definition, () => snapshot);
  }

  /** 包入口在启用时加载，静态贡献与生命周期统一由宿主处理。 */
  registerDeferred(metadata: PluginMetadata, resolveDefinition: DefinitionResolver): void {
    this.register(metadata, resolveDefinition);
  }

  private register(definition: PluginMetadata, resolveDefinition: DefinitionResolver): void {
    this.assertOpen();
    assertLocalId(definition.id);
    if (definition.apiVersion !== 1) throw new Error("不支持的插件 API 版本");
    if (!definition.name.trim() || !definition.version.trim()) throw new Error("插件元信息不完整");
    if (this.entries.has(definition.id)) throw new Error(`插件已注册：${definition.id}`);
    this.entries.set(definition.id, {
      metadata: Object.freeze({
        id: definition.id,
        name: definition.name,
        version: definition.version,
        apiVersion: definition.apiVersion,
      }),
      resolveDefinition,
      state: this.restartRequired.has(definition.id) ? "restart-required" : "disabled",
      pending: Promise.resolve(),
    });
    this.changed();
  }

  getState(id: string): PluginState {
    return this.entry(id).state;
  }

  /** 仅统计已启用插件；停用后贡献已回收，返回空对象。 */
  listContributions(id: string): Partial<Record<PluginContributionKind, number>> {
    const entry = this.entries.get(id);
    if (!entry || entry.state !== "active" || !entry.activation) return {};
    return Object.fromEntries([...entry.activation.contributions].filter(([, count]) => count > 0));
  }

  listPlugins(): PluginInfo[] {
    return [...this.entries.values()].map(({ metadata, state, error }) => ({
      id: metadata.id,
      name: metadata.name,
      version: metadata.version,
      state,
      ...(error === undefined ? {} : { error }),
    }));
  }

  enable(id: string): Promise<void> {
    this.assertOpen();
    const entry = this.entry(id);
    return this.enqueue(entry, async () => {
      this.assertOpen();
      if (entry.removing) throw new Error("插件正在注销");
      if (this.restartRequired.has(id)) throw new Error("插件清理未能确认完成，请重启应用后再启用");
      if (entry.state === "active") return;
      entry.error = undefined;
      entry.state = "activating";
      this.changed();
      try {
        const activation: Activation = {
          controller: new AbortController(),
          resources: [],
          contributions: new Map(),
          onActivated: [],
          beforeActivated: [],
        };
        entry.activation = activation;
        await waitForLifecycle(
          async () => {
            const definition = await entry.resolveDefinition(activation.controller.signal);
            this.assertActive(entry, activation);
            if (
              definition.id !== entry.metadata.id ||
              definition.name !== entry.metadata.name ||
              definition.version !== entry.metadata.version ||
              definition.apiVersion !== entry.metadata.apiVersion ||
              typeof definition.create !== "function"
            )
              throw new Error("插件定义与登记元信息不一致");
            activation.instance = definition.create();
            if (!activation.instance || typeof activation.instance.activate !== "function")
              throw new Error("插件实例缺少 activate");
            const ids = new Set<string>();
            for (const skill of definition.skills ?? []) {
              assertLocalId(skill.id);
              if (
                ids.has(skill.id) ||
                !skill.name?.trim() ||
                !skill.description?.trim() ||
                !skill.content?.trim()
              )
                throw new Error("插件 Skill 声明重复或不完整");
              ids.add(skill.id);
              const resource = this.options.skills?.register(
                { id: entry.metadata.id, name: entry.metadata.name },
                skill
              );
              if (resource) activation.resources.push(resource);
              tally(activation, "skill", 1);
            }
            tally(activation, "editor", definition.editorExtensions?.length ?? 0);
            tally(activation, "whiteboard", definition.whiteboardExtensions?.length ?? 0);
            if (definition.ai) {
              const ids = new Set<string>();
              if (!Array.isArray(definition.ai.features) || definition.ai.features.length > 32)
                throw new Error("AI 功能声明无效");
              for (const feature of definition.ai.features) {
                assertLocalId(feature.id);
                if (!feature.name?.trim() || ids.has(feature.id))
                  throw new Error("AI 功能名称或 ID 无效");
                ids.add(feature.id);
              }
              tally(activation, "ai", definition.ai.features.length);
              activation.ai = await this.options.ai?.bind(
                { id: entry.metadata.id, name: entry.metadata.name },
                definition.ai.features,
                activation.controller.signal
              );
              this.assertActive(entry, activation);
            }
            activation.context = this.context(entry, activation);
            return activation.instance.activate(activation.context);
          },
          Date.now() + ACTIVATION_TIMEOUT_MS,
          "激活",
          activation.controller.signal
        );
        this.assertActive(entry, activation);
        for (const validate of activation.beforeActivated.splice(0)) validate();
        entry.state = "active";
        for (const commit of activation.onActivated.splice(0)) commit();
        this.changed();
      } catch (error) {
        if (error instanceof LifecycleTimeoutError) this.restartRequired.add(id);
        const errors = await this.cleanup(entry);
        entry.state = this.restartRequired.has(id) ? "restart-required" : "failed";
        entry.error = error instanceof Error ? error.message : "插件激活失败";
        this.changed();
        if (errors.length) throw new AggregateError([error, ...errors], "插件激活与回收失败");
        throw error;
      }
    });
  }

  disable(id: string): Promise<void> {
    const entry = this.entry(id);
    entry.activation?.controller.abort();
    this.changed();
    return this.enqueue(entry, async () => {
      entry.state = "deactivating";
      const errors = await this.cleanup(entry);
      entry.state = this.restartRequired.has(id) ? "restart-required" : "disabled";
      if (errors.length) entry.error = "插件部分清理失败，需要重启应用";
      else if (entry.state === "disabled") entry.error = undefined;
      this.changed();
      if (errors.length) throw new AggregateError(errors, "插件已停用，但部分清理失败");
    });
  }

  async unregister(id: string): Promise<void> {
    const entry = this.entry(id);
    entry.removing = true;
    try {
      await this.disable(id);
    } finally {
      if (this.entries.get(id) === entry) this.entries.delete(id);
      this.changed();
    }
  }

  listCommands(): CommandInfo[] {
    return [...this.commands.values()]
      .filter(
        command => command.entry.state === "active" && !command.activation.controller.signal.aborted
      )
      .map(command => ({ ...command.info }));
  }

  async executeCommand(id: string, input: JsonValue = null): Promise<JsonValue> {
    this.assertOpen();
    const command = this.commands.get(id);
    if (!command || command.entry.state !== "active") throw new Error(`命令不可用：${id}`);
    this.assertActive(command.entry, command.activation);
    const result = await command.run(copyJson(input));
    // 已提交的外部副作用不会回滚，但旧实例不能继续向调用者交付有效结果。
    this.assertActive(command.entry, command.activation);
    return copyJson(result);
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.disposal = (async () => {
      const results = await Promise.allSettled(
        [...this.entries.keys()].map(id => this.disable(id))
      );
      this.entries.clear();
      this.listeners.clear();
      const errors = results.flatMap(result =>
        result.status === "rejected" ? [result.reason] : []
      );
      if (errors.length) throw new AggregateError(errors, "插件宿主清理失败");
    })();
    return this.disposal;
  }

  /** 宿主装配静态内容交互时复用同一激活实例的存储；不暴露整个上下文。 */
  getStorage(id: string): PluginStorage {
    const entry = this.entries.get(id);
    if (!entry || entry.state !== "active" || !entry.activation?.context)
      throw new Error(`插件 ${id} 尚未启用或已失活`);
    this.assertActive(entry, entry.activation);
    return entry.activation.context.storage;
  }

  private context(entry: Entry, activation: Activation): PluginContext {
    const pages = new WeakMap<PluginPageHandle, { id: string; active: () => boolean }>();
    const mcps = new Map<string, PluginMCPDefinition>();
    const toolRenderers = new Set<string>();
    const scope: StorageScope = Object.freeze({
      pluginId: entry.metadata.id,
      workspaceId: this.options.workspaceId,
      signal: activation.controller.signal,
    });
    const register = (resource: Disposable): Disposable => {
      this.assertActive(entry, activation);
      let disposed = false;
      let disposal: Promise<void> | undefined;
      const owned = {
        dispose: () => {
          if (disposed) return disposal;
          disposed = true;
          try {
            disposal = Promise.resolve(resource.dispose());
          } catch (error) {
            disposal = Promise.reject(error);
          }
          // 作者提前调用 dispose 后，宿主仍需跟踪未完成或失败的清理。
          void disposal.catch(() => undefined);
          return disposal;
        },
      };
      activation.resources.push(owned);
      return owned;
    };
    const registerAs = (kind: PluginContributionKind, resource: Disposable): Disposable => {
      const owned = register(resource);
      tally(activation, kind, 1);
      let counted = true;
      return {
        dispose: () => {
          if (counted) {
            counted = false;
            tally(activation, kind, -1);
          }
          return owned.dispose();
        },
      };
    };
    const prepareStorage = (key: string) => {
      this.assertActive(entry, activation);
      assertLocalId(key);
    };
    let excerptProvider: Disposable | undefined;
    const excerptsAdapter = () => {
      this.assertActive(entry, activation);
      if (!this.options.excerpts) throw new Error("当前宿主不支持摘录");
      return this.options.excerpts;
    };
    const excerptWrite = async <T>(write: (adapter: ExcerptsAdapter) => Promise<T>) => {
      const adapter = excerptsAdapter();
      if (!excerptProvider) throw new Error("写入摘录前须先注册摘录提供方");
      const result = await write(adapter);
      this.assertActive(entry, activation);
      return copyJson(result) as T;
    };
    const context: PluginContext = {
      pluginId: scope.pluginId,
      publish: Object.freeze({
        register: (definition: PublishProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("发布提供方必须属于当前插件");
          if (!this.options.publish) throw new Error("当前宿主不支持发布提供方");
          const create = definition.create.bind(definition);
          return registerAs(
            "publish",
            this.options.publish.register(context, {
              id: scope.pluginId,
              name: definition.name,
              create: config => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("发布插件尚未激活");
                return create(copyJson(config));
              },
            })
          );
        },
      }),
      images: Object.freeze({
        register: (definition: ImageProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("图片提供方必须属于当前插件");
          if (!this.options.images) throw new Error("当前宿主不支持图片提供方");
          const create = definition.create.bind(definition);
          return registerAs(
            "images",
            this.options.images.register(context, {
              id: scope.pluginId,
              name: definition.name,
              create: (config, modelId) => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("图片插件尚未激活");
                return create(copyJson(config), modelId);
              },
            })
          );
        },
      }),
      tts: Object.freeze({
        register: (definition: TTSProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("语音提供方必须属于当前插件");
          if (!this.options.tts) throw new Error("当前宿主不支持语音提供方");
          const create = definition.create.bind(definition);
          return registerAs(
            "tts",
            this.options.tts.register(context, {
              id: scope.pluginId,
              name: definition.name,
              create: (config, modelId) => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("语音插件尚未激活");
                return create(copyJson(config), modelId);
              },
            })
          );
        },
      }),
      upload: Object.freeze({
        uploadRemote: async (file: UploadFile, options?: { signal?: AbortSignal }) => {
          this.assertActive(entry, activation);
          const uploadRemote = this.options.upload?.uploadRemote;
          if (!uploadRemote) throw new Error("当前宿主不支持远端上传");
          const signal = AbortSignal.any([
            scope.signal,
            ...(options?.signal ? [options.signal] : []),
          ]);
          signal.throwIfAborted();
          const url = await uploadRemote(
            { ...file, content: new Uint8Array(file.content) },
            signal
          );
          signal.throwIfAborted();
          this.assertActive(entry, activation);
          return url;
        },
        register: (definition: UploadProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.upload !== "function"
          )
            throw new Error("上传提供方必须属于当前插件");
          if (!this.options.upload) throw new Error("当前宿主不支持资源上传提供方");
          const upload = definition.upload.bind(definition);
          return registerAs(
            "upload",
            this.options.upload.register(
              context,
              Object.freeze({
                id: scope.pluginId,
                name: definition.name,
                upload: async (file: UploadFile, config: JsonValue, signal: AbortSignal) => {
                  this.assertActive(entry, activation);
                  if (entry.state !== "active") throw new Error("上传插件尚未激活");
                  const executionSignal = AbortSignal.any([scope.signal, signal]);
                  executionSignal.throwIfAborted();
                  const result = await upload(file, config, executionSignal);
                  executionSignal.throwIfAborted();
                  this.assertActive(entry, activation);
                  const url = new URL(result);
                  if (!["http:", "https:"].includes(url.protocol))
                    throw new Error("上传插件必须返回HTTP(S)资源地址");
                  return result;
                },
              })
            )
          );
        },
      }),
      sync: Object.freeze({
        register: (definition: SyncProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("同步提供方必须属于当前插件");
          if (!this.options.sync) throw new Error("当前宿主不支持同步提供方");
          return registerAs(
            "sync",
            this.options.sync.register(context, Object.freeze({ ...definition }))
          );
        },
      }),
      workspaceId: scope.workspaceId,
      signal: scope.signal,
      register,
      ai: activation.ai ?? unavailableAI,
      chat: Object.freeze({
        registerToolRenderer: async (definition: PluginToolRendererDefinition) => {
          this.assertActive(entry, activation);
          const declared = snapshotToolRendererDefinition(definition);
          const adapter = this.options.chat;
          if (!adapter) throw new Error("当前宿主不支持聊天工具渲染");
          const key = JSON.stringify([declared.mcpId, declared.toolName]);
          if (toolRenderers.has(key)) throw new Error("工具渲染器已注册");
          toolRenderers.add(key);
          const local = new AbortController();
          const signal = AbortSignal.any([scope.signal, local.signal]);
          let resource: Disposable | undefined;
          const owned = registerAs("chat", {
            dispose: () => {
              local.abort();
              toolRenderers.delete(key);
              return resource?.dispose();
            },
          });
          const validate = () => {
            if (signal.aborted) return;
            const mcp = mcps.get(declared.mcpId);
            if (!mcp || (mcp.tools && !mcp.tools.some(tool => tool.name === declared.toolName)))
              throw new Error("工具渲染器只能绑定本插件已注册的 MCP 工具");
          };
          try {
            const commit = await adapter.prepare({ ...context, signal }, declared);
            this.assertActive(entry, activation);
            signal.throwIfAborted();
            if (entry.state === "active") {
              validate();
              resource = commit();
            } else {
              activation.beforeActivated.push(validate);
              activation.onActivated.push(() => {
                if (!signal.aborted) resource = commit();
              });
            }
            return owned;
          } catch (error) {
            await owned.dispose();
            throw error;
          }
        },
      }),
      mcp: Object.freeze({
        register: (definition: PluginMCPDefinition) => {
          this.assertActive(entry, activation);
          const declared = snapshotMCPDefinition(definition);
          const adapter = this.options.mcp;
          if (!adapter) throw new Error("当前宿主不支持 MCP");
          if (mcps.has(definition.id)) throw new Error("MCP 已注册");
          const local = new AbortController();
          const signal = AbortSignal.any([scope.signal, local.signal]);
          const snapshot: PluginMCPDefinition = declared.transport
            ? declared
            : {
                ...declared,
                tools: declared.tools.map(tool => ({
                  ...tool,
                  execute: async (args, call) => {
                    this.assertActive(entry, activation);
                    signal.throwIfAborted();
                    if (entry.state !== "active") throw new Error("插件尚未激活");
                    const executionSignal = AbortSignal.any([signal, call.signal]);
                    executionSignal.throwIfAborted();
                    const result = await tool.execute(copyJson(args) as typeof args, {
                      signal: executionSignal,
                    });
                    executionSignal.throwIfAborted();
                    this.assertActive(entry, activation);
                    return snapshotMCPToolResult(result);
                  },
                })),
              };
          mcps.set(definition.id, declared);
          let resource: Disposable | undefined;
          const commit = () => {
            if (signal.aborted) return;
            resource = adapter.register({ ...context, signal }, snapshot, {
              id: scope.pluginId,
              name: entry.metadata.name,
              executionIdentity: crypto.randomUUID(),
            });
          };
          const owned = registerAs("mcp", {
            dispose: () => {
              local.abort();
              mcps.delete(definition.id);
              return resource?.dispose();
            },
          });
          if (entry.state === "active") {
            try {
              commit();
            } catch (error) {
              void owned.dispose();
              throw error;
            }
          } else activation.onActivated.push(commit);
          return owned;
        },
      }),
      services: bindPluginServices(this.options.services, scope.signal, () =>
        this.assertActive(entry, activation)
      ),
      fetch: async (input, init) => {
        this.assertActive(entry, activation);
        const execute = this.options.fetch;
        if (!execute) throw new Error("当前宿主不支持 fetch");
        const source =
          init?.signal === undefined && input instanceof Request ? input.signal : init?.signal;
        const signal = AbortSignal.any([scope.signal, ...(source ? [source] : [])]);
        const response = await execute(input, { ...init, signal });
        if (signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          signal.throwIfAborted();
        }
        this.assertActive(entry, activation);
        return response;
      },
      settings: Object.freeze({
        register: (definition: PluginSettingsDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("设置分区标题不能为空");
          if (!this.options.settings) throw new Error("当前宿主不支持设置分区");
          const handle = this.options.settings.register(context, Object.freeze({ ...definition }));
          let disposed = false;
          const resource = registerAs("settings", {
            dispose: () => {
              disposed = true;
              return handle.dispose();
            },
          });
          return Object.freeze({
            id: handle.id,
            open: async () => {
              this.assertActive(entry, activation);
              if (disposed) throw new Error("设置分区已注销");
              await handle.open();
            },
            dispose: resource.dispose,
          });
        },
      }),
      editor: Object.freeze({
        register: (contribution: PluginEditorContribution) => {
          this.assertActive(entry, activation);
          if (!this.options.editor) throw new Error("当前宿主不支持编辑器扩展");
          if (contribution.scene !== "workbench") throw new Error("不支持的编辑器场景");
          if (contribution.extension.apiVersion !== 1 || "plugins" in contribution.extension)
            throw new Error("不支持的编辑器扩展协议");
          assertLocalId(contribution.extension.id);
          if (!contribution.extension.id.startsWith(`${scope.pluginId}.`))
            throw new Error("编辑器扩展 ID 必须使用插件命名空间");
          for (const id of [
            ...(contribution.extension.elements ?? []).map(element => element.type),
            ...(contribution.extension.commands ?? []).map(command => command.id),
            ...(contribution.codecs ?? []).map(codec => codec.type),
          ]) {
            if (!id.startsWith(`${scope.pluginId}.`))
              throw new Error("编辑器节点、命令与 codec 必须使用插件命名空间");
          }
          return registerAs("editor", this.options.editor.register(context, contribution));
        },
      }),
      commands: Object.freeze({
        register: (command: PluginCommand) => {
          this.assertActive(entry, activation);
          assertLocalId(command.id);
          if (!command.title.trim()) throw new Error("命令标题不能为空");
          const id = `${scope.pluginId}:${command.id}`;
          if (this.commands.has(id)) throw new Error(`命令已注册：${id}`);
          const value = {
            info: {
              id,
              pluginId: scope.pluginId,
              pluginName: entry.metadata.name,
              title: command.title,
            },
            entry,
            activation,
            run: command.run,
          };
          this.commands.set(id, value);
          this.changed();
          return registerAs("command", {
            dispose: () => {
              if (this.commands.get(id) === value) this.commands.delete(id);
              this.changed();
            },
          });
        },
      }),
      storage: Object.freeze({
        get: async (key: string) => {
          prepareStorage(key);
          const value = await this.options.storage.get(scope, key);
          this.assertActive(entry, activation);
          return value === undefined ? undefined : copyJson(value);
        },
        set: async (key: string, value: JsonValue) => {
          prepareStorage(key);
          await this.options.storage.set(scope, key, copyJson(value));
        },
        delete: async (key: string) => {
          prepareStorage(key);
          await this.options.storage.delete(scope, key);
        },
      }),
      excerpts: Object.freeze({
        register: (definition: PluginExcerptProviderDefinition) => {
          const adapter = excerptsAdapter();
          if (excerptProvider) throw new Error("摘录提供方已注册");
          if (typeof definition.label !== "string" || !definition.label.trim())
            throw new Error("摘录提供方名称不能为空");
          if (definition.open !== undefined && typeof definition.open !== "function")
            throw new Error("摘录提供方 open 必须是函数");
          const handle = adapter.register(context, Object.freeze({ ...definition }));
          const owned = registerAs("excerpts", {
            dispose: () => {
              if (excerptProvider === owned) excerptProvider = undefined;
              return handle.dispose();
            },
          });
          excerptProvider = owned;
          return owned;
        },
        replace: (source: PluginExcerptSource, items: PluginExcerptItem[]) =>
          excerptWrite(adapter =>
            adapter.replace(
              context,
              copyJson(source) as unknown as PluginExcerptSource,
              copyJson(items) as unknown as PluginExcerptItem[]
            )
          ),
        patch: (source: PluginExcerptSource, change: PluginExcerptChange) =>
          excerptWrite(adapter =>
            adapter.patch(
              context,
              copyJson(source) as unknown as PluginExcerptSource,
              copyJson(change) as unknown as PluginExcerptChange
            )
          ),
        sources: async () => {
          const result = await excerptsAdapter().sources(context);
          this.assertActive(entry, activation);
          return copyJson(result) as unknown as PluginExcerptSourceSummary[];
        },
        items: async (sourceKey: string) => {
          if (typeof sourceKey !== "string" || !sourceKey) throw new Error("摘录来源无效");
          const result = await excerptsAdapter().items(context, sourceKey);
          this.assertActive(entry, activation);
          return copyJson(result) as unknown as PluginExcerptEntry[];
        },
      }),
      materials: Object.freeze({
        actions: async (ref: PluginMaterialRef) => {
          this.assertActive(entry, activation);
          if (!this.options.materials) throw new Error("当前宿主不支持材料动作");
          const actions = await this.options.materials.actions(
            context,
            copyJson(ref) as unknown as PluginMaterialRef
          );
          this.assertActive(entry, activation);
          return actions.map(action =>
            Object.freeze({
              id: action.id,
              label: action.label,
              run: async () => {
                this.assertActive(entry, activation);
                await action.run();
              },
            })
          );
        },
      }),
      sidebar: Object.freeze({
        registerGroup: (definition: PluginSidebarGroupDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("侧边栏分组标题不能为空");
          if (!this.options.sidebar) throw new Error("当前宿主不支持侧边栏");
          const handle = this.options.sidebar.registerGroup(
            context,
            Object.freeze({ ...definition })
          );
          return Object.freeze({ id: handle.id, dispose: register(handle).dispose });
        },
        registerItem: (definition: PluginSidebarItemDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("侧边栏条目标题不能为空");
          const page = pages.get(definition.page);
          if (!page?.active()) throw new Error("侧边栏条目必须关联本次启用注册的有效页面");
          if (!this.options.sidebar) throw new Error("当前宿主不支持侧边栏");
          return registerAs(
            "sidebar",
            this.options.sidebar.registerItem(
              context,
              Object.freeze({
                ...definition,
                params: Object.freeze(normalizePageParams(definition.params ?? {})),
              }),
              page.id
            )
          );
        },
      }),
      pages: Object.freeze({
        register: (definition: PluginPageDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("页面标题不能为空");
          if (
            definition.match !== undefined &&
            definition.match !== "single" &&
            definition.match !== "params"
          ) {
            throw new Error("不支持的页面匹配方式");
          }
          if (!this.options.pages) throw new Error("当前宿主不支持页面");
          const handle = this.options.pages.register(context, Object.freeze({ ...definition }));
          let disposed = false;
          const resource = registerAs("page", {
            dispose: () => {
              disposed = true;
              return handle.dispose();
            },
          });
          const exposed: PluginPageHandle = Object.freeze({
            id: handle.id,
            open: async (params = {}) => {
              this.assertActive(entry, activation);
              if (disposed) throw new Error("页面已注销");
              await handle.open(normalizePageParams(params));
            },
            dispose: resource.dispose,
          });
          pages.set(exposed, { id: definition.id, active: () => !disposed });
          return exposed;
        },
      }),
    };
    return Object.freeze(context);
  }

  private changed() {
    this.revision++;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("插件状态订阅失败", error);
      }
    }
  }

  private async cleanup(entry: Entry): Promise<unknown[]> {
    const activation = entry.activation;
    if (!activation) return [];
    activation.controller.abort();
    const errors: unknown[] = [];
    const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
    try {
      await waitForLifecycle(() => activation.instance?.deactivate?.(), deadline, "停用");
    } catch (error) {
      errors.push(error);
    }
    for (const resource of activation.resources.splice(0).reverse()) {
      try {
        await waitForLifecycle(() => resource.dispose(), deadline, "资源清理");
      } catch (error) {
        errors.push(error);
      }
    }
    entry.activation = undefined;
    if (errors.length) this.restartRequired.add(entry.metadata.id);
    return errors;
  }

  private assertActive(entry: Entry, activation: Activation): void {
    if (
      this.closed ||
      entry.activation !== activation ||
      this.entries.get(entry.metadata.id) !== entry
    ) {
      throw new Error("插件实例已失效");
    }
    assertStorageActive({
      pluginId: entry.metadata.id,
      workspaceId: this.options.workspaceId,
      signal: activation.controller.signal,
    });
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("插件宿主已关闭");
  }

  private entry(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`插件未注册：${id}`);
    return entry;
  }

  private enqueue(entry: Entry, operation: () => Promise<void>): Promise<void> {
    const result = entry.pending.then(operation, operation);
    entry.pending = result.catch(() => undefined);
    return result;
  }
}
