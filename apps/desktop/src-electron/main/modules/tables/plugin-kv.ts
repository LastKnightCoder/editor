import Database from "better-sqlite3";
import { basename } from "node:path";

interface Scope {
  databaseName: string;
  pluginId: string;
}

/** 单个值的上限：私有存储放设置与少量状态，大块内容应放进插件内容的正文 */
const MAX_VALUE = 1024 * 1024;

/**
 * 插件私有存储（context.storage）：按插件与键保存 JSON 文本，随主库云同步。
 * 值的校验与复制由渲染端宿主完成，这里守住库身份与大小。
 */
export default class PluginKvTable {
  static getListenEvents() {
    return {
      "plugin-kv:get": this.get.bind(this),
      "plugin-kv:set": this.set.bind(this),
      "plugin-kv:delete": this.remove.bind(this),
      "plugin-kv:clear": this.clear.bind(this),
    };
  }

  private static assertScope(db: Database.Database, scope: Scope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
    if (typeof scope.pluginId !== "string" || !scope.pluginId) throw new Error("插件 ID 无效");
  }

  private static assertValue(value: unknown): asserts value is string {
    if (typeof value !== "string") throw new Error("存储值无效");
    if (value.length > MAX_VALUE) throw new Error("单个存储值不能超过 1 MB");
  }

  /** 返回 JSON 文本；不存在时为 null */
  static get(db: Database.Database, request: Scope & { key: string }): string | null {
    this.assertScope(db, request);
    const row = db
      .prepare("SELECT value FROM plugin_kv WHERE plugin_id = ? AND key = ?")
      .get(request.pluginId, request.key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  static set(db: Database.Database, request: Scope & { key: string; value: string }): void {
    this.assertScope(db, request);
    this.assertValue(request.value);
    db.prepare(
      `INSERT INTO plugin_kv (plugin_id, key, value, update_time) VALUES (?, ?, ?, ?)
       ON CONFLICT (plugin_id, key) DO UPDATE SET value = excluded.value, update_time = excluded.update_time`
    ).run(request.pluginId, request.key, request.value, Date.now());
  }

  static remove(db: Database.Database, request: Scope & { key: string }): void {
    this.assertScope(db, request);
    db.prepare("DELETE FROM plugin_kv WHERE plugin_id = ? AND key = ?").run(
      request.pluginId,
      request.key
    );
  }

  /** 卸载插件并选择清除数据时，删除它在当前库的全部私有存储 */
  static clear(db: Database.Database, request: Scope): number {
    this.assertScope(db, request);
    return db.prepare("DELETE FROM plugin_kv WHERE plugin_id = ?").run(request.pluginId).changes;
  }
}
