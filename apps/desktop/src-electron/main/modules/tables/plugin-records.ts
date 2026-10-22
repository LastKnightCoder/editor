import Database from "better-sqlite3";
import { basename } from "node:path";
import { assertIndexedValues } from "@tau/plugins/query";
import type {
  PluginRecordCount,
  PluginRecordInsert,
  PluginRecordPage,
  PluginRecordQuery,
  PluginRecordRow,
  PluginRecordScope,
  PluginRecordUpdate,
} from "@/types/plugin-records";
import { writeAsPlugin } from "../domain-event-origin";
import { runPage, whereClause, type QuerySource, type SqlFragment } from "./plugin-query";

const MAX_LIMIT = 200;
const MAX_DATA = 64 * 1024;
const RECORD_ID = /^[A-Za-z0-9-]{1,64}$/;
const CONFLICT_PREFIX = "PLUGIN_CONFLICT:";

/** 有孤儿标记的插件数据表：插件目录不在时记 orphaned_time，宽限期后删除 */
export const ORPHAN_TABLES = ["plugin_entities", "plugin_records"] as const;

const COLUMNS = "r.id, r.collection, r.data, r.create_time, r.update_time";
const FROM = "plugin_records r";
const QUERY_SOURCE: QuerySource = {
  json: "r.data",
  builtins: { createdAt: "r.create_time", updatedAt: "r.update_time" },
  id: "r.id",
};

interface Row {
  id: string;
  collection: string;
  data: string;
  create_time: number;
  update_time: number;
}

function toRecord(row: Row): PluginRecordRow {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
  } catch {
    // 损坏的 JSON 按空对象返回
  }
  return {
    id: row.id,
    collection: row.collection,
    data,
    createdAt: row.create_time,
    updatedAt: row.update_time,
    revision: String(row.update_time),
  };
}

/** 插件再次读写自己的数据即说明已重新安装：撤销实体与记录的孤儿标记 */
export function adoptPluginData(db: Database.Database, pluginId: string) {
  for (const table of ORPHAN_TABLES)
    db.prepare(
      `UPDATE ${table} SET orphaned_time = NULL WHERE plugin_id = ? AND orphaned_time IS NOT NULL`
    ).run(pluginId);
}

/** 按已安装的插件标记或撤销孤儿；installed 为 null（读不到插件目录）时不动 */
export function markOrphans(
  db: Database.Database,
  table: (typeof ORPHAN_TABLES)[number],
  installed: ReadonlySet<string> | null,
  now: number
) {
  if (!installed) return;
  const pluginIds = (
    db.prepare(`SELECT DISTINCT plugin_id FROM ${table}`).all() as Array<{ plugin_id: string }>
  ).map(row => row.plugin_id);
  const mark = db.prepare(
    `UPDATE ${table} SET orphaned_time = ? WHERE plugin_id = ? AND orphaned_time IS NULL`
  );
  const adopt = db.prepare(
    `UPDATE ${table} SET orphaned_time = NULL WHERE plugin_id = ? AND orphaned_time IS NOT NULL`
  );
  for (const pluginId of pluginIds)
    if (installed.has(pluginId)) adopt.run(pluginId);
    else mark.run(now, pluginId);
}

/**
 * 插件记录（context.records）：插件内部的结构化数据，只按插件 ID 读写自己的记录。
 * 参数在渲染端宿主校验过，这里再守住库身份、归属、大小与索引字段类型。删除不进「最近删除」。
 */
export default class PluginRecordTable {
  static getListenEvents() {
    return {
      "plugin-records:insert": this.insert.bind(this),
      "plugin-records:get": this.get.bind(this),
      "plugin-records:query": this.query.bind(this),
      "plugin-records:count": this.count.bind(this),
      "plugin-records:update": this.update.bind(this),
      "plugin-records:delete": this.remove.bind(this),
    };
  }

  private static assertScope(db: Database.Database, scope: PluginRecordScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
    if (typeof scope.pluginId !== "string" || !scope.pluginId) throw new Error("插件 ID 无效");
    if (typeof scope.collection !== "string" || !scope.collection) throw new Error("集合名无效");
    adoptPluginData(db, scope.pluginId);
  }

  private static serialize(data: unknown, indexes: PluginRecordInsert["indexes"]) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("data 必须是对象");
    assertIndexedValues(data as never, indexes ?? {});
    const text = JSON.stringify(data);
    if (text.length > MAX_DATA) throw new Error("data 超过 64 KB");
    return text;
  }

  private static row(db: Database.Database, scope: PluginRecordScope, id: string) {
    return db
      .prepare(
        `SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = ? AND r.plugin_id = ? AND r.collection = ?`
      )
      .get(id, scope.pluginId, scope.collection) as Row | undefined;
  }

  private static filters(
    scope: PluginRecordScope,
    where: PluginRecordCount["where"]
  ): SqlFragment[] {
    return [
      { sql: "r.plugin_id = ? AND r.collection = ?", params: [scope.pluginId, scope.collection] },
      whereClause(QUERY_SOURCE, where ?? []),
    ];
  }

  static insert(db: Database.Database, request: PluginRecordInsert): PluginRecordRow {
    this.assertScope(db, request);
    if (typeof request.id !== "string" || !RECORD_ID.test(request.id))
      throw new Error("记录 ID 无效");
    const data = this.serialize(request.data, request.indexes);
    const now = Date.now();
    const exists = db.prepare("SELECT 1 FROM plugin_records WHERE id = ?").get(request.id);
    if (exists) throw new Error(`${CONFLICT_PREFIX}记录 ID 已存在`);
    writeAsPlugin(request.pluginId, () =>
      db
        .prepare(
          `INSERT INTO plugin_records (id, plugin_id, collection, data, create_time, update_time)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(request.id, request.pluginId, request.collection, data, now, now)
    );
    return toRecord(this.row(db, request, request.id) as Row);
  }

  static get(db: Database.Database, request: PluginRecordScope & { id: string }) {
    this.assertScope(db, request);
    const row = this.row(db, request, request.id);
    return row ? toRecord(row) : null;
  }

  static query(
    db: Database.Database,
    request: PluginRecordScope & { query: PluginRecordQuery }
  ): PluginRecordPage {
    this.assertScope(db, request);
    const { query } = request;
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT)
      throw new Error(`limit 必须是 1–${MAX_LIMIT} 的整数`);
    const page = runPage<Row>(db, QUERY_SOURCE, {
      columns: COLUMNS,
      from: FROM,
      filters: this.filters(request, query.where),
      order: query.orderBy,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit,
      scope: [request.pluginId, request.collection, query.where ?? [], query.orderBy],
    });
    return { items: page.rows.map(toRecord), ...(page.cursor ? { cursor: page.cursor } : {}) };
  }

  static count(db: Database.Database, request: PluginRecordCount): number {
    this.assertScope(db, request);
    const filters = this.filters(request, request.where).filter(item => item.sql);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM ${FROM} WHERE ${filters.map(item => item.sql).join(" AND ")}`
      )
      .get(...filters.flatMap(item => item.params)) as { count: number };
    return row.count;
  }

  static update(db: Database.Database, request: PluginRecordUpdate): PluginRecordRow {
    this.assertScope(db, request);
    const data = this.serialize(request.data, request.indexes);
    return writeAsPlugin(request.pluginId, () =>
      db.transaction(() => {
        const current = this.row(db, request, request.id);
        if (!current) throw new Error("记录不存在");
        if (
          request.expectedRevision !== undefined &&
          String(current.update_time) !== request.expectedRevision
        )
          throw new Error(`${CONFLICT_PREFIX}数据已被修改，请重新读取后再试`);
        // 同一毫秒内连续修改也要换出新的 revision
        const now = Math.max(Date.now(), current.update_time + 1);
        db.prepare("UPDATE plugin_records SET data = ?, update_time = ? WHERE id = ?").run(
          data,
          now,
          request.id
        );
        return toRecord(this.row(db, request, request.id) as Row);
      })()
    );
  }

  static remove(
    db: Database.Database,
    request: PluginRecordScope & { id: string; expectedRevision?: string }
  ): void {
    this.assertScope(db, request);
    writeAsPlugin(request.pluginId, () =>
      db.transaction(() => {
        const current = this.row(db, request, request.id);
        if (!current) throw new Error("记录不存在");
        if (
          request.expectedRevision !== undefined &&
          String(current.update_time) !== request.expectedRevision
        )
          throw new Error(`${CONFLICT_PREFIX}数据已被修改，请重新读取后再试`);
        db.prepare("DELETE FROM plugin_records WHERE id = ?").run(request.id);
      })()
    );
  }

  /** 开库维护：标记或撤销孤儿，删除孤儿超过宽限期的记录 */
  static collectOrphans(
    db: Database.Database,
    options: { installed: ReadonlySet<string> | null; now: number; graceMs: number }
  ): number {
    return db.transaction(() => {
      markOrphans(db, "plugin_records", options.installed, options.now);
      return db
        .prepare(
          "DELETE FROM plugin_records WHERE orphaned_time IS NOT NULL AND orphaned_time <= ?"
        )
        .run(options.now - options.graceMs).changes;
    })();
  }
}
