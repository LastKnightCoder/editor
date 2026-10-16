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
} from "./index";
import { assertLocalId, copyJson } from "./values";
import {
  ACTIVATION_TIMEOUT_MS,
  CLEANUP_TIMEOUT_MS,
  LifecycleTimeoutError,
  waitForLifecycle,
} from "./lifecycle";
import { assertStorageActive, type StorageAdapter, type StorageScope } from "./storage";
import { normalizePageParams, type PluginPageDefinition, type PluginPageHandle } from "./pages";
export { createMemoryStorage } from "./storage";
export type { StorageAdapter, StorageScope } from "./storage";
export { createBrowserStorage } from "./browser-storage";
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

export type PluginState =
  "disabled" | "activating" | "active" | "deactivating" | "failed" | "restart-required";

export interface CommandInfo {
  id: string;
  pluginId: string;
  title: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  state: PluginState;
  error?: string;
}

interface Activation {
  controller: AbortController;
  resources: Disposable[];
  instance: PluginInstance;
}

interface Entry {
  definition: PluginDefinition;
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
      settings?: SettingsAdapter;
      sidebar?: SidebarAdapter;
      excerpts?: ExcerptsAdapter;
      materials?: MaterialsAdapter;
      fetch?: typeof globalThis.fetch;
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
    this.assertOpen();
    assertLocalId(definition.id);
    if (definition.apiVersion !== 1) throw new Error("不支持的插件 API 版本");
    if (!definition.name.trim() || !definition.version.trim()) throw new Error("插件元信息不完整");
    if (this.entries.has(definition.id)) throw new Error(`插件已注册：${definition.id}`);
    this.entries.set(definition.id, {
      definition: Object.freeze({ ...definition }),
      state: this.restartRequired.has(definition.id) ? "restart-required" : "disabled",
      pending: Promise.resolve(),
    });
    this.changed();
  }

  getState(id: string): PluginState {
    return this.entry(id).state;
  }

  listPlugins(): PluginInfo[] {
    return [...this.entries.values()].map(({ definition, state, error }) => ({
      id: definition.id,
      name: definition.name,
      version: definition.version,
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
          instance: entry.definition.create(),
        };
        entry.activation = activation;
        await waitForLifecycle(
          () => activation.instance.activate(this.context(entry, activation)),
          Date.now() + ACTIVATION_TIMEOUT_MS,
          "激活",
          activation.controller.signal
        );
        this.assertActive(entry, activation);
        entry.state = "active";
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

  private context(entry: Entry, activation: Activation): PluginContext {
    const pages = new WeakMap<PluginPageHandle, { id: string; active: () => boolean }>();
    const scope: StorageScope = Object.freeze({
      pluginId: entry.definition.id,
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
      workspaceId: scope.workspaceId,
      signal: scope.signal,
      register,
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
          const resource = register({
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
          return register(this.options.editor.register(context, contribution));
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
            info: { id, pluginId: scope.pluginId, title: command.title },
            entry,
            activation,
            run: command.run,
          };
          this.commands.set(id, value);
          this.changed();
          return register({
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
          const owned = register({
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
          return register(
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
          const resource = register({
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
      await waitForLifecycle(() => activation.instance.deactivate?.(), deadline, "停用");
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
    if (errors.length) this.restartRequired.add(entry.definition.id);
    return errors;
  }

  private assertActive(entry: Entry, activation: Activation): void {
    if (
      this.closed ||
      entry.activation !== activation ||
      this.entries.get(entry.definition.id) !== entry
    ) {
      throw new Error("插件实例已失效");
    }
    assertStorageActive({
      pluginId: entry.definition.id,
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
