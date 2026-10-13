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
} from "./index";
import { assertLocalId, copyJson } from "./values";
import { assertStorageActive, type StorageAdapter, type StorageScope } from "./storage";
import { normalizePageParams, type PluginPageDefinition, type PluginPageHandle } from "./pages";

export { createMemoryStorage } from "./storage";
export type { StorageAdapter, StorageScope } from "./storage";
export { createBrowserStorage } from "./browser-storage";
export { normalizePageParams } from "./pages";

export interface PagesAdapter {
  register(context: PluginContext, definition: PluginPageDefinition): PluginPageHandle;
}

export interface EditorAdapter {
  register(context: PluginContext, contribution: PluginEditorContribution): Disposable;
}

export interface SettingsAdapter {
  register(context: PluginContext, definition: PluginSettingsDefinition): PluginSettingsHandle;
}

export type PluginState = "disabled" | "activating" | "active" | "deactivating" | "failed";

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

  constructor(
    private readonly options: {
      workspaceId: string;
      storage: StorageAdapter;
      pages?: PagesAdapter;
      editor?: EditorAdapter;
      settings?: SettingsAdapter;
    }
  ) {
    if (!options.workspaceId.trim()) throw new Error("插件宿主需要明确的工作区身份");
    this.options = Object.freeze({ ...options });
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
      state: "disabled",
      pending: Promise.resolve(),
    });
    this.changed();
  }

  getState(id: string): PluginState {
    return this.entry(id).state;
  }

  listPlugins(): PluginInfo[] {
    return [...this.entries.values()].map(({ definition, state }) => ({
      id: definition.id,
      name: definition.name,
      version: definition.version,
      state,
    }));
  }

  enable(id: string): Promise<void> {
    this.assertOpen();
    const entry = this.entry(id);
    return this.enqueue(entry, async () => {
      this.assertOpen();
      if (entry.removing) throw new Error("插件正在注销");
      if (entry.state === "active") return;
      entry.state = "activating";
      this.changed();
      try {
        const activation: Activation = {
          controller: new AbortController(),
          resources: [],
          instance: entry.definition.create(),
        };
        entry.activation = activation;
        await activation.instance.activate(this.context(entry, activation));
        this.assertActive(entry, activation);
        entry.state = "active";
        this.changed();
      } catch (error) {
        const errors = await this.cleanup(entry);
        entry.state = "failed";
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
      entry.state = "disabled";
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
    const scope: StorageScope = Object.freeze({
      pluginId: entry.definition.id,
      workspaceId: this.options.workspaceId,
      signal: activation.controller.signal,
    });
    const register = (resource: Disposable): Disposable => {
      this.assertActive(entry, activation);
      let disposed = false;
      const owned = {
        dispose: () => {
          if (disposed) return;
          disposed = true;
          return resource.dispose();
        },
      };
      activation.resources.push(owned);
      return owned;
    };
    const prepareStorage = (key: string) => {
      this.assertActive(entry, activation);
      assertLocalId(key);
    };
    const context: PluginContext = {
      pluginId: scope.pluginId,
      workspaceId: scope.workspaceId,
      signal: scope.signal,
      register,
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
          return Object.freeze({
            id: handle.id,
            open: async (params = {}) => {
              this.assertActive(entry, activation);
              if (disposed) throw new Error("页面已注销");
              await handle.open(normalizePageParams(params));
            },
            dispose: resource.dispose,
          });
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
    try {
      await activation.instance.deactivate?.();
    } catch (error) {
      errors.push(error);
    }
    for (const resource of activation.resources.reverse()) {
      try {
        await resource.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    entry.activation = undefined;
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
