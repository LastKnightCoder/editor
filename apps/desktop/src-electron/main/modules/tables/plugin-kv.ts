import Database from "better-sqlite3";
import { basename } from "node:path";
import type { PluginWorkspaceDataSummary } from "@/types/plugin-retained-data";
import type { SqliteRow } from "../../types/table";
import { releaseContentDeferred } from "./content-release";

interface Scope {
  databaseName: string;
  pluginId: string;
}

interface DatabaseScope {
  databaseName: string;
}

/** 单个值的上限：私有存储放设置与少量状态，大块内容应放进插件内容的正文 */
const MAX_VALUE = 1024 * 1024;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function maxTimestamp(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

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
      "plugin-kv:summary": this.summary.bind(this),
    };
  }

  private static assertDatabase(db: Database.Database, databaseName: string) {
    if (basename(db.name).replace(/\.db$/, "") !== databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
  }

  private static assertScope(db: Database.Database, scope: Scope) {
    this.assertDatabase(db, scope.databaseName);
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
    const { pluginId } = request;
    return db.transaction(() => {
      const contents = db
        .prepare("SELECT content_id FROM plugin_entities WHERE plugin_id = ?")
        .all(pluginId) as Array<{ content_id: number }>;
      db.prepare("DELETE FROM plugin_links WHERE plugin_id = ?").run(pluginId);
      db.prepare("DELETE FROM plugin_entities WHERE plugin_id = ?").run(pluginId);
      for (const row of contents) releaseContentDeferred(db, row.content_id);
      db.prepare("DELETE FROM plugin_entity_kinds WHERE plugin_id = ?").run(pluginId);
      db.prepare("DELETE FROM plugin_records WHERE plugin_id = ?").run(pluginId);
      db.prepare(
        "DELETE FROM plugin_operations WHERE plugin_id = ? AND entity = 'plugin-entity'"
      ).run(pluginId);
      db.prepare("DELETE FROM plugin_create_receipts WHERE plugin_id = ?").run(pluginId);
      db.prepare("DELETE FROM plugin_ref_grants WHERE plugin_id = ?").run(pluginId);
      return db.prepare("DELETE FROM plugin_kv WHERE plugin_id = ?").run(pluginId).changes;
    })();
  }

  /** 汇总当前资料库中留有数据的全部插件；涵盖 clear 会清理的每张表，供管理页筛选已卸载插件 */
  static summary(db: Database.Database, request: DatabaseScope): PluginWorkspaceDataSummary[] {
    this.assertDatabase(db, request.databaseName);
    const items = new Map<string, PluginWorkspaceDataSummary>();
    const entry = (pluginId: string): PluginWorkspaceDataSummary => {
      let current = items.get(pluginId);
      if (!current) {
        current = {
          pluginId,
          entities: 0,
          entityKinds: [],
          records: 0,
          kv: 0,
          other: 0,
          updatedAt: null,
        };
        items.set(pluginId, current);
      }
      return current;
    };

    const collect = (
      sql: string,
      apply: (target: PluginWorkspaceDataSummary, count: number, updatedAt: number | null) => void
    ) => {
      for (const row of db.prepare(sql).all() as SqliteRow[]) {
        const pluginId = asString(row.plugin_id);
        const count = asCount(row.count);
        if (!pluginId || count <= 0) continue;
        apply(entry(pluginId), count, asTimestamp(row.updated_at));
      }
    };

    collect(
      "SELECT plugin_id, COUNT(*) AS count, MAX(update_time) AS updated_at FROM plugin_entities GROUP BY plugin_id",
      (target, count, updatedAt) => {
        target.entities += count;
        target.updatedAt = maxTimestamp(target.updatedAt, updatedAt);
      }
    );
    collect(
      "SELECT plugin_id, COUNT(*) AS count, MAX(update_time) AS updated_at FROM plugin_records GROUP BY plugin_id",
      (target, count, updatedAt) => {
        target.records += count;
        target.updatedAt = maxTimestamp(target.updatedAt, updatedAt);
      }
    );
    collect(
      "SELECT plugin_id, COUNT(*) AS count, MAX(update_time) AS updated_at FROM plugin_kv GROUP BY plugin_id",
      (target, count, updatedAt) => {
        target.kv += count;
        target.updatedAt = maxTimestamp(target.updatedAt, updatedAt);
      }
    );
    for (const sql of [
      "SELECT plugin_id, COUNT(*) AS count, MAX(create_time) AS updated_at FROM plugin_links GROUP BY plugin_id",
      "SELECT plugin_id, COUNT(*) AS count, MAX(update_time) AS updated_at FROM plugin_entity_kinds GROUP BY plugin_id",
      "SELECT plugin_id, COUNT(*) AS count, MAX(create_time) AS updated_at FROM plugin_operations WHERE entity = 'plugin-entity' GROUP BY plugin_id",
      "SELECT plugin_id, COUNT(*) AS count, NULL AS updated_at FROM plugin_create_receipts GROUP BY plugin_id",
      "SELECT plugin_id, COUNT(*) AS count, MAX(create_time) AS updated_at FROM plugin_ref_grants GROUP BY plugin_id",
    ]) {
      collect(sql, (target, count, updatedAt) => {
        target.other += count;
        target.updatedAt = maxTimestamp(target.updatedAt, updatedAt);
      });
    }

    const kindRows = db
      .prepare(
        `SELECT DISTINCT k.plugin_id, k.label
         FROM plugin_entity_kinds k
         WHERE k.label != ''
           AND EXISTS (
             SELECT 1 FROM plugin_entities e
             WHERE e.plugin_id = k.plugin_id AND e.kind = k.kind
           )
         ORDER BY k.update_time DESC, k.kind ASC`
      )
      .all() as SqliteRow[];
    for (const row of kindRows) {
      const pluginId = asString(row.plugin_id);
      const label = asString(row.label).trim();
      const target = pluginId ? items.get(pluginId) : undefined;
      if (target && label && !target.entityKinds.includes(label)) target.entityKinds.push(label);
    }

    return [...items.values()].sort((a, b) => {
      if (a.updatedAt !== null && b.updatedAt !== null && a.updatedAt !== b.updatedAt)
        return b.updatedAt - a.updatedAt;
      if (a.updatedAt !== null) return -1;
      if (b.updatedAt !== null) return 1;
      return a.pluginId.localeCompare(b.pluginId);
    });
  }
}
