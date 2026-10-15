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
      | "prepareDevelopmentReload"
      | "commitDevelopmentReload"
      | "discardDevelopmentReload"
    > = commands,
    private readonly notify: () => void = () => undefined,
    private readonly reloadCounts: Map<string, number> = new Map()
  ) {
    for (const record of session.plugins) this.register(record);
  }

  owns(id: string) {
    return this.records.has(id);
  }
  busy(id: string) {
    return this.pending.has(id);
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

  reload(id: string) {
    return this.run(id, async previous => {
      if (this.host.getState(id) === "restart-required") throw new Error("请重启应用后再重载");
      if ((this.reloadCounts.get(id) ?? 0) >= 20)
        throw new Error("当前窗口已重载此插件 20 次，请重启应用后继续");
      const prepared = await this.client.prepareDevelopmentReload(this.session.token, id);
      if (!prepared) return;
      const { ticket, record: next } = prepared;
      try {
        this.assertOpen();
        if (!next.artifact || next.manifest.id !== id) throw new Error("重载产物无效");
        const active = this.host.getState(id) === "active";
        // 提交新版本前保留旧登记；中断时跳过自动启动。
        await this.client.saveDevelopmentPluginState(this.session.token, id, active, true);
        this.assertOpen();
        try {
          await this.host.disable(id);
          this.assertOpen();
          await this.host.unregister(id);
          this.define(next);
          this.reloadCounts.set(id, (this.reloadCounts.get(id) ?? 0) + 1);
          if (active) await this.host.enable(id);
          this.assertOpen();
          await this.client.commitDevelopmentReload(
            this.session.token,
            ticket,
            "next",
            active,
            false
          );
          Object.assign(previous, next, { enabled: active, starting: false, error: undefined });
        } catch (error) {
          this.assertOpen();
          try {
            let cleanupError: unknown;
            if (this.host.listPlugins().some(item => item.id === id)) {
              try {
                await this.host.unregister(id);
              } catch (failure) {
                cleanupError = failure;
              }
            }
            this.define(previous);
            if (cleanupError || this.host.getState(id) === "restart-required")
              throw new Error("清理未能确认完成，需要重启应用");
            if (active) await this.host.enable(id);
            this.assertOpen();
            await this.client.commitDevelopmentReload(
              this.session.token,
              ticket,
              "previous",
              active,
              false
            );
            previous.enabled = active;
            previous.starting = false;
          } catch (recoveryError) {
            await this.host.disable(id).catch(() => undefined);
            previous.enabled = false;
            previous.starting = true;
            await this.client
              .commitDevelopmentReload(this.session.token, ticket, "previous", false, true)
              .catch(() => undefined);
            throw new AggregateError(
              [error, recoveryError],
              "重载与恢复失败，插件已停止；请检查登记文件并重启应用，必要时跳过自动启动"
            );
          }
          throw new Error(
            `重载失败，已恢复旧版本：${error instanceof Error ? error.message : String(error)}`
          );
        }
      } finally {
        // 票据只持有内存快照，连接失效时由会话释放兜底。
        await this.client
          .discardDevelopmentReload(this.session.token, ticket)
          .catch(() => undefined);
      }
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
    this.define(record);
  }

  private define(record: RestoredDevelopmentPlugin) {
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
    this.notify();
    void next
      .finally(() => {
        if (this.pending.get(id) === next) this.pending.delete(id);
        this.notify();
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
