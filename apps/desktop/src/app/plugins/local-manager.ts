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
import { setContentPluginEnabled } from "@/commands/plugin-local";

import {
  localPluginStateKey,
  contentPluginLoaded,
  contentPluginError,
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

  constructor(
    private readonly host: PluginHost,
    private readonly reserved: readonly string[],
    private readonly scan: () => Promise<LocalPluginScan>,
    private readonly getModules: () => Promise<SharedPluginModules>,
    private readonly preferences: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem" | "key" | "length"
    >,
    private readonly notify: () => void,
    private readonly removePackage: (id: string) => Promise<void>
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
    if (this.isContentPlugin(id))
      return this.preferences.getItem(localPluginStateKey(id)) === "true";
    return this.states.enabled(id);
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
      if (this.states.enabled(id)) await this.states.disable(id);
      await this.removePackage(id);
      this.preferences.removeItem(localPluginStateKey(id));
      if (purgeData) clearBrowserPluginStorage(this.preferences, id);
      await this.reload();
    });
  }

  private async reload() {
    try {
      const snapshot = await this.scan();
      this.assertOpen();
      this.directory = snapshot.directory;
      this.updates = snapshot.updates ?? [];
      this.clientVersion = snapshot.clientVersion ?? "";
      for (const entry of snapshot.entries)
        if (
          entry.artifact &&
          hasStaticContent(entry.artifact.manifest) &&
          entry.contentEnabled !== undefined
        )
          this.preferences.setItem(localPluginStateKey(entry.id), String(entry.contentEnabled));
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
      // 插件中心安装视为同意启用：仅在从未设置过启用偏好时生效，用户停用后不再覆盖。
      for (const [id, source] of this.sources)
        if (
          source.kind === "center" &&
          this.records.has(id) &&
          this.preferences.getItem(localPluginStateKey(id)) === null
        )
          this.preferences.setItem(localPluginStateKey(id), "true");
      this.states.cancel();
      this.states = this.activationManager();
      await this.states.restore();
    } catch (error) {
      if (!this.closed) this.scanError = this.message(error);
      throw error;
    }
  }

  enable(id: string) {
    if (this.isContentPlugin(id))
      return this.run(async () => {
        await setContentPluginEnabled(id, true);
        this.preferences.setItem(localPluginStateKey(id), "true");
      });
    return this.run(() => this.states.enable(id));
  }
  disable(id: string) {
    if (this.isContentPlugin(id))
      return this.run(async () => {
        await setContentPluginEnabled(id, false);
        this.preferences.setItem(localPluginStateKey(id), "false");
      });
    return this.run(() => this.states.disable(id));
  }
  restore(key: string | null) {
    return this.run(async () => {
      await this.states.restore(key);
    });
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
            : this.preferences.getItem(key);
        },
        setItem: (key, value) => this.preferences.setItem(key, value),
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
