import { isContentPlugin as hasStaticContent } from "@tau/plugins/package";
import {
  clearBrowserPluginStorage,
  type DevelopmentPluginPackage,
  type PluginHost,
} from "@tau/plugins/host";
import type {
  LocalPluginEntry,
  LocalPluginScan,
  LocalPluginSource,
  LocalPluginUpdate,
} from "@/types/plugin-local";
import { PluginActivationManager } from "./activation-manager";
import { registerPluginPackage, type SharedPluginModules } from "./package-loader";

import {
  localPluginStateKey,
  contentPluginLoaded,
  contentPluginError,
  setContentPluginIntent,
} from "./content-plugin-state";
export { localPluginStateKey } from "./content-plugin-state";

export class LocalPluginManager {
  directory = "";
  scanError = "";
  issues: readonly LocalPluginEntry[] = [];
  updates: readonly LocalPluginUpdate[] = [];
  clientVersion = "";
  private readonly records = new Map<string, DevelopmentPluginPackage>();
  private sources = new Map<string, LocalPluginSource>();
  private states: PluginActivationManager;
  private pending: Promise<unknown> = Promise.resolve();
  private operations = 0;
  private closed = false;
  private readonly intents = new Map<string, boolean>();

  constructor(
    private readonly host: PluginHost,
    private readonly reserved: readonly string[],
    private readonly scan: (legacy: Record<string, unknown>) => Promise<LocalPluginScan>,
    private readonly getModules: () => Promise<SharedPluginModules>,
    private readonly preferences: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem" | "key" | "length"
    >,
    private readonly notify: () => void,
    private readonly removePackage: (id: string) => Promise<void>,
    private readonly setEnabled: (id: string, enabled: boolean) => Promise<void>
  ) {
    this.states = this.activationManager();
  }

  owns(id: string) {
    return this.records.has(id);
  }
  busy() {
    return this.operations > 0;
  }
  enabled(id: string) {
    return this.intents.get(id) === true;
  }
  isContentPlugin(id: string) {
    const artifact = this.records.get(id);
    return artifact ? hasStaticContent(artifact.manifest) : false;
  }
  pendingContentIds() {
    return [...this.records.keys()].filter(
      id => this.isContentPlugin(id) && this.enabled(id) !== contentPluginLoaded(id)
    );
  }
  source(id: string): LocalPluginSource | undefined {
    return this.sources.get(id);
  }
  error(id: string) {
    if (this.isContentPlugin(id)) {
      if (contentPluginError(id)) return contentPluginError(id);
      if (this.enabled(id) !== contentPluginLoaded(id)) return "内容插件启停将在重启应用后生效";
    }
    return this.states.error(id) ?? this.issues.find(entry => entry.id === id)?.error;
  }

  refresh() {
    return this.run(() => this.reload());
  }

  /** 停用后移除包；私有数据只在 purgeData 时删除，重新安装可恢复原数据。 */
  uninstall(id: string, purgeData: boolean) {
    return this.run(async () => {
      if (contentPluginLoaded(id)) throw new Error("请先停用内容插件并重启应用，再卸载");
      await this.saveIntent(id, false);
      if (this.states.enabled(id)) await this.states.disable(id);
      await this.removePackage(id);
      try {
        this.preferences.removeItem(localPluginStateKey(id));
      } catch {
        console.warn("plugin_preference_mirror_unavailable");
      }
      if (purgeData) clearBrowserPluginStorage(this.preferences, id);
      await this.reload();
    });
  }

  private async reload() {
    try {
      const legacy: Record<string, unknown> = Object.create(null);
      for (let index = 0; index < this.preferences.length; index++) {
        const key = this.preferences.key(index);
        if (!key?.startsWith("tau-local-plugin-enabled:v1:")) continue;
        const value = this.preferences.getItem(key);
        legacy[key.slice("tau-local-plugin-enabled:v1:".length)] =
          value === "true" ? true : value === "false" ? false : value;
      }
      const snapshot = await this.scan(legacy);
      this.assertOpen();
      this.directory = snapshot.directory;
      this.updates = snapshot.updates ?? [];
      this.clientVersion = snapshot.clientVersion ?? "";
      for (const entry of snapshot.entries) {
        if (entry.enabled === undefined) throw new Error("插件启用状态缺失");
        this.mirrorIntent(entry.id, entry.enabled);
      }
      this.scanError = "";
      const issues: LocalPluginEntry[] = [];
      const present = new Set(snapshot.entries.map(entry => entry.id));
      for (const id of this.records.keys()) {
        if (present.has(id)) continue;
        try {
          await this.host.unregister(id);
        } catch (error) {
          issues.push({ id, directory: snapshot.directory, error: this.message(error) });
        } finally {
          this.records.delete(id);
        }
        this.assertOpen();
      }
      for (const entry of snapshot.entries) {
        this.assertOpen();
        if (this.reserved.includes(entry.id)) {
          issues.push({ ...entry, artifact: undefined, error: "目录插件 ID 与内置插件冲突" });
          continue;
        }
        if (!entry.artifact) {
          issues.push({ ...entry, error: entry.error ?? "插件包不可用" });
          continue;
        }
        const previous = this.records.get(entry.id);
        if (previous && JSON.stringify(previous) === JSON.stringify(entry.artifact)) continue;
        if (
          previous &&
          ["active", "activating", "deactivating", "restart-required"].includes(
            this.host.getState(entry.id)
          )
        ) {
          issues.push({
            id: entry.id,
            directory: entry.directory,
            error: "文件已更新，当前实例保持不变；请重启应用加载更新，或停用后刷新列表",
          });
          continue;
        }
        try {
          if (previous) {
            await this.host.unregister(entry.id);
            this.records.delete(entry.id);
            this.assertOpen();
          }
          registerPluginPackage(this.host, entry.artifact, this.getModules);
          this.records.set(entry.id, entry.artifact);
        } catch (error) {
          issues.push({ id: entry.id, directory: entry.directory, error: this.message(error) });
        }
      }
      this.assertOpen();
      this.issues = issues;
      this.sources = new Map(
        snapshot.entries.flatMap(entry => (entry.source ? [[entry.id, entry.source]] : []))
      );
      this.states.cancel();
      this.states = this.activationManager();
      await this.states.restore();
    } catch (error) {
      if (!this.closed) this.scanError = this.message(error);
      throw error;
    }
  }

  enable(id: string) {
    return this.run(async () => {
      await this.saveIntent(id, true);
      if (!this.isContentPlugin(id)) await this.states.enable(id);
    });
  }
  disable(id: string) {
    return this.run(async () => {
      await this.saveIntent(id, false);
      if (!this.isContentPlugin(id)) await this.states.disable(id);
    });
  }
  restore() {
    return this.refresh();
  }
  private async saveIntent(id: string, enabled: boolean) {
    if (!this.owns(id)) throw new Error("本地插件不存在");
    await this.setEnabled(id, enabled);
    this.assertOpen();
    this.mirrorIntent(id, enabled);
  }
  private mirrorIntent(id: string, enabled: boolean) {
    this.intents.set(id, enabled);
    setContentPluginIntent(id, enabled);
    try {
      this.preferences.setItem(localPluginStateKey(id), String(enabled));
    } catch {
      console.warn("plugin_preference_mirror_unavailable");
    }
  }
  cancel() {
    this.closed = true;
    this.states.cancel();
  }

  private activationManager() {
    return new PluginActivationManager(
      this.host,
      [...this.records.keys()],
      {
        getItem: key => {
          const id = [...this.records.keys()].find(id => key === localPluginStateKey(id));
          return id && this.isContentPlugin(id)
            ? String(contentPluginLoaded(id))
            : String(id ? this.intents.get(id) === true : false);
        },
        setItem: () => undefined,
      },
      this.notify,
      localPluginStateKey
    );
  }
  private assertOpen() {
    if (this.closed) throw new Error("本地插件管理已关闭");
  }
  private message(error: unknown) {
    return error instanceof Error ? error.message : "本地插件操作失败";
  }
  private run(action: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.reject(new Error("本地插件管理已关闭"));
    this.operations++;
    const operation = this.pending
      .catch(() => undefined)
      .then(() => {
        this.assertOpen();
        return action();
      });
    this.pending = operation;
    this.notify();
    const cleanup = () => {
      this.operations--;
      if (!this.closed) this.notify();
    };
    void operation.then(cleanup, cleanup);
    return operation;
  }
}
