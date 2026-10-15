import type { PluginHost } from "@tau/plugins/host";
import type { DevelopmentSession, RestoredDevelopmentPlugin } from "@/types/plugin-development";
import * as commands from "@/commands/plugin-development";
import { registerDevelopmentPlugin, type SharedPluginModules } from "./development-loader";

export class DevelopmentPluginManager {
  private readonly records = new Map<string, RestoredDevelopmentPlugin>();
  private readonly pending = new Map<string, Promise<void>>();
  private closed = false;

  constructor(
    private readonly host: PluginHost,
    private readonly session: DevelopmentSession,
    private readonly getModules: () => Promise<SharedPluginModules>,
    private readonly client: Pick<
      typeof commands,
      | "chooseDevelopmentPlugin"
      | "saveDevelopmentPluginState"
      | "removeDevelopmentPlugin"
      | "closeDevelopmentPlugins"
    > = commands,
    private readonly notify: () => void = () => undefined
  ) {
    for (const record of session.plugins) this.register(record);
  }

  owns(id: string) {
    return this.records.has(id);
  }
  enabled(id: string) {
    return this.records.get(id)?.enabled ?? false;
  }
  error(id: string) {
    return this.records.get(id)?.error;
  }

  async restore() {
    await Promise.all(
      [...this.records.values()].map(async record => {
        if (!record.enabled || record.starting || record.error || this.session.skipStartup) return;
        try {
          await this.enable(record.manifest.id);
        } catch {
          /* 失败由管理记录和宿主状态展示，不阻断其他插件。 */
        }
      })
    );
  }

  async choose() {
    this.assertOpen();
    const record = await this.client.chooseDevelopmentPlugin(this.session.token);
    this.assertOpen();
    if (record) this.register(record);
  }

  enable(id: string) {
    return this.run(id, async record => {
      if (!record.artifact) throw new Error(record.error ?? "插件文件不可用");
      if (this.host.getState(id) === "restart-required") throw new Error("请重启应用后再启用");
      await this.client.saveDevelopmentPluginState(this.session.token, id, true, true);
      record.enabled = true;
      record.starting = true;
      try {
        this.assertOpen();
        await this.host.enable(id);
        this.assertOpen();
        await this.client.saveDevelopmentPluginState(this.session.token, id, true, false);
        record.starting = false;
        record.error = undefined;
      } catch (error) {
        await this.host.disable(id).catch(() => undefined);
        // 未能确认启动成功时保留 starting，重启后不自动执行。
        throw error;
      }
    });
  }

  disable(id: string) {
    return this.run(id, async record => {
      await this.client.saveDevelopmentPluginState(this.session.token, id, false, false);
      record.enabled = false;
      record.starting = false;
      await this.host.disable(id);
    });
  }

  remove(id: string) {
    return this.run(id, async record => {
      await this.client.saveDevelopmentPluginState(this.session.token, id, false, false);
      record.enabled = false;
      record.starting = false;
      await this.host.disable(id).catch(() => undefined);
      await this.client.removeDevelopmentPlugin(this.session.token, id);
      await this.host.unregister(id);
      this.records.delete(id);
    });
  }

  cancel() {
    this.closed = true;
  }
  async close() {
    this.cancel();
    await Promise.allSettled([...this.pending.values()]);
    await this.client.closeDevelopmentPlugins(this.session.token);
  }

  private register(record: RestoredDevelopmentPlugin) {
    this.records.set(record.manifest.id, record);
    if (record.starting && !record.error)
      record.error = "上次启动未完成，已跳过自动启用；可手动重试或移除";
    if (record.artifact) registerDevelopmentPlugin(this.host, record.artifact, this.getModules);
    else
      this.host.registerTrusted({
        ...record.manifest,
        create: () => ({
          activate() {
            throw new Error(record.error ?? "插件文件不可用");
          },
        }),
      });
  }

  private run(
    id: string,
    operation: (record: RestoredDevelopmentPlugin) => Promise<void>
  ): Promise<void> {
    this.assertOpen();
    const previous = this.pending.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        this.assertOpen();
        const record = this.records.get(id);
        if (!record) throw new Error("插件登记已不存在");
        try {
          await operation(record);
        } catch (error) {
          record.error = error instanceof Error ? error.message : "插件管理失败";
          throw error;
        } finally {
          this.notify();
        }
      });
    this.pending.set(id, next);
    void next
      .finally(() => {
        if (this.pending.get(id) === next) this.pending.delete(id);
      })
      .catch(() => undefined);
    return next;
  }

  private assertOpen() {
    if (this.closed) throw new Error("插件管理会话已关闭");
  }
}

export function migratePluginPreferences(storage: Storage, name: string, workspaceId: string) {
  const aliases = new Set([name, name.endsWith(".db") ? name.slice(0, -3) : name + ".db"]);
  const oldKeys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith("tau-plugin-prefs:")) continue;
    const scope = JSON.parse(key.slice("tau-plugin-prefs:".length)) as string[];
    if (!Array.isArray(scope) || scope.length !== 3 || !aliases.has(scope[0])) continue;
    const target = `tau-plugin-prefs:${JSON.stringify([workspaceId, scope[1], scope[2]])}`;
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(target) === null) storage.setItem(target, value);
    oldKeys.push(key);
  }
  for (const key of oldKeys) storage.removeItem(key);
}
