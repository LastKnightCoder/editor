import Database from "better-sqlite3";
import { basename } from "node:path";
import {
  assertContentResourceSpecs,
  BUILTIN_CONTENT_RESOURCES,
  mergeContentResources,
  type ContentResourceDeclarations,
  type ContentResourceSpec,
} from "@tau/db-schema/content-resources";

const MAX_TYPES = 64;

/**
 * 插件节点的资源声明：随库保存，插件不运行、已卸载或在其他设备上时，协作上传与 CLI 照样按它找资源。
 * 插件更新后按类型覆盖；不再声明的类型保留，库里可能还有它的节点。
 */
export default class PluginElementResourcesTable {
  static getListenEvents() {
    return {
      "plugin-element-resources:declare": this.declare.bind(this),
    };
  }

  static declare(
    db: Database.Database,
    request: {
      databaseName: string;
      pluginId: string;
      resources: Record<string, readonly ContentResourceSpec[]>;
    }
  ): boolean {
    if (basename(db.name).replace(/\.db$/, "") !== request.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
    const { pluginId, resources } = request;
    if (typeof pluginId !== "string" || !pluginId) throw new Error("插件 ID 无效");
    if (!resources || typeof resources !== "object" || Array.isArray(resources))
      throw new Error("资源声明无效");
    const entries = Object.entries(resources);
    if (entries.length > MAX_TYPES) throw new Error("资源声明过多");
    for (const [type, specs] of entries) {
      if (!type || Object.hasOwn(BUILTIN_CONTENT_RESOURCES, type))
        throw new Error(`节点类型无效：${type}`);
      assertContentResourceSpecs(specs);
    }
    const select = db.prepare(
      "SELECT resources FROM plugin_element_resources WHERE plugin_id = ? AND type = ?"
    );
    const upsert = db.prepare(
      `INSERT INTO plugin_element_resources (plugin_id, type, resources, update_time) VALUES (?, ?, ?, ?)
       ON CONFLICT(plugin_id, type) DO UPDATE SET resources = excluded.resources,
         update_time = excluded.update_time`
    );
    return db.transaction(() => {
      let changed = false;
      for (const [type, specs] of entries) {
        const value = JSON.stringify(specs);
        const current = select.get(pluginId, type) as { resources: string } | undefined;
        if (current?.resources === value) continue;
        upsert.run(pluginId, type, value, Date.now());
        changed = true;
      }
      return changed;
    })();
  }

  /** 内置节点与库里保存的插件节点声明；损坏的行跳过 */
  static catalog(db: Database.Database): ContentResourceDeclarations {
    const rows = db.prepare("SELECT type, resources FROM plugin_element_resources").all() as {
      type: string;
      resources: string;
    }[];
    const plugins: Record<string, readonly ContentResourceSpec[]> = {};
    for (const row of rows) {
      try {
        const specs: unknown = JSON.parse(row.resources);
        assertContentResourceSpecs(specs);
        plugins[row.type] = specs;
      } catch {
        // 跳过无法解析的声明，不影响其他类型
      }
    }
    return mergeContentResources(plugins, BUILTIN_CONTENT_RESOURCES);
  }
}
