import type {
  Disposable,
  JsonValue,
  PluginCommand,
  PluginContext,
  PluginDefinition,
  PluginInstance,
} from "./index";
import { assertLocalId, copyJson } from "./values";
import { assertStorageActive, type StorageAdapter, type StorageScope } from "./storage";

export { createMemoryStorage } from "./storage";
export type { StorageAdapter, StorageScope } from "./storage";

export type PluginState = "disabled" | "activating" | "active" | "deactivating" | "failed";

export interface CommandInfo {
  id: string;
  pluginId: string;
  title: string;
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

  constructor(private readonly options: { workspaceId: string; storage: StorageAdapter }) {
    if (!options.workspaceId.trim()) throw new Error("插件宿主需要明确的工作区身份");
    this.options = Object.freeze({ ...options });
  }

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
  }

  getState(id: string): PluginState {
    return this.entry(id).state;
  }

  enable(id: string): Promise<void> {
    this.assertOpen();
    const entry = this.entry(id);
    return this.enqueue(entry, async () => {
      this.assertOpen();
      if (entry.removing) throw new Error("插件正在注销");
      if (entry.state === "active") return;
      entry.state = "activating";
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
      } catch (error) {
        const errors = await this.cleanup(entry);
        entry.state = "failed";
        if (errors.length) throw new AggregateError([error, ...errors], "插件激活与回收失败");
        throw error;
      }
    });
  }

  disable(id: string): Promise<void> {
    const entry = this.entry(id);
    entry.activation?.controller.abort();
    return this.enqueue(entry, async () => {
      entry.state = "deactivating";
      const errors = await this.cleanup(entry);
      entry.state = "disabled";
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
    return Object.freeze({
      pluginId: scope.pluginId,
      workspaceId: scope.workspaceId,
      signal: scope.signal,
      register,
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
          return register({
            dispose: () => {
              if (this.commands.get(id) === value) this.commands.delete(id);
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
    });
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
