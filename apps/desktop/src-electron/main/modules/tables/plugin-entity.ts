import Database from "better-sqlite3";
import { basename } from "node:path";
import type { Descendant } from "slate";
import type { PluginContentOwner } from "@/types/plugin-data";
import type {
  PluginEntityCreate,
  PluginEntityPage,
  PluginEntityPatch,
  PluginEntityQuery,
  PluginEntityRecord,
  PluginEntityScope,
} from "@/types/plugin-entities";
import ContentTable from "./content";

const MAX_LIMIT = 200;
const CONFLICT_PREFIX = "PLUGIN_CONFLICT:";
const EMPTY_CONTENT = [{ type: "paragraph", children: [{ text: "" }] }] as Descendant[];

const BASE_SQL = `SELECT e.id, e.plugin_id, e.kind, e.key, e.title, e.meta, e.create_time,
    e.update_time, e.content_id, ct.create_time AS content_created,
    MAX(e.update_time, IFNULL(ct.update_time, 0)) AS updated
  FROM plugin_entities e JOIN contents ct ON ct.id = e.content_id`;

interface Row {
  id: number;
  plugin_id: string;
  kind: string;
  key: string;
  title: string;
  meta: string;
  create_time: number;
  update_time: number;
  content_id: number;
  content_created: number;
  updated: number;
}

function parseMeta(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export interface PluginEntityIndexDoc {
  id: number;
  title: string;
  updateTime: number;
  content: Descendant[];
}

function parseContent(value: string): Descendant[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toRecord(row: Row): PluginEntityRecord {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    kind: row.kind,
    key: row.key,
    title: row.title,
    contentId: row.content_id,
    contentCreatedAt: row.content_created,
    meta: parseMeta(row.meta),
    createdAt: row.create_time,
    updatedAt: row.updated,
    revision: String(row.update_time),
  };
}

/**
 * 插件实体：插件自建、每项持有一份正文引用的内容。只按插件 ID 读写自己的实体，
 * 宿主不做业务权限检查；参数在渲染端宿主校验过，这里再守住库身份与归属。
 */
export default class PluginEntityTable {
  static getListenEvents() {
    return {
      "plugin-entities:create": this.create.bind(this),
      "plugin-entities:get": this.get.bind(this),
      "plugin-entities:find": this.find.bind(this),
      "plugin-entities:query": this.query.bind(this),
      "plugin-entities:update": this.update.bind(this),
      "plugin-entities:locate": this.locate.bind(this),
    };
  }

  private static assertScope(db: Database.Database, scope: PluginEntityScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
    if (typeof scope.pluginId !== "string" || !scope.pluginId) throw new Error("插件 ID 无效");
    // 插件正在运行说明已重新安装：撤销孤儿标记，宽限期内的内容原样找回
    db.prepare(
      "UPDATE plugin_entities SET orphaned_time = NULL WHERE plugin_id = ? AND orphaned_time IS NOT NULL"
    ).run(scope.pluginId);
  }

  private static row(db: Database.Database, pluginId: string, id: number): Row | undefined {
    return db.prepare(`${BASE_SQL} WHERE e.id = ? AND e.plugin_id = ?`).get(id, pluginId) as
      Row | undefined;
  }

  /** 宿主按 ID 读取任意插件的实体（检索结果与打开），不撤销孤儿标记 */
  static byId(db: Database.Database, id: number): PluginEntityRecord | null {
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const row = db.prepare(`${BASE_SQL} WHERE e.id = ?`).get(id) as Row | undefined;
    return row ? toRecord(row) : null;
  }

  static locate(
    db: Database.Database,
    request: { databaseName: string; id: number }
  ): PluginEntityRecord | null {
    if (basename(db.name).replace(/\.db$/, "") !== request.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
    return this.byId(db, request.id);
  }

  static create(
    db: Database.Database,
    request: PluginEntityScope & { input: PluginEntityCreate }
  ): PluginEntityRecord {
    this.assertScope(db, request);
    const { kind, key, title, meta } = request.input;
    return db.transaction(() => {
      const existing = db
        .prepare("SELECT id FROM plugin_entities WHERE plugin_id = ? AND kind = ? AND key = ?")
        .get(request.pluginId, kind, key);
      if (existing) throw new Error(`${CONFLICT_PREFIX}已存在 key 相同的内容`);
      const contentId = ContentTable.createContent(db, {
        content: structuredClone(EMPTY_CONTENT),
        count: 0,
      });
      const now = Date.now();
      const id = Number(
        db
          .prepare(
            `INSERT INTO plugin_entities
               (plugin_id, kind, key, title, content_id, meta, create_time, update_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(request.pluginId, kind, key, title, contentId, JSON.stringify(meta), now, now)
          .lastInsertRowid
      );
      return toRecord(this.row(db, request.pluginId, id) as Row);
    })();
  }

  static get(
    db: Database.Database,
    request: PluginEntityScope & { id: number }
  ): PluginEntityRecord | null {
    this.assertScope(db, request);
    const row = this.row(db, request.pluginId, request.id);
    return row ? toRecord(row) : null;
  }

  static find(
    db: Database.Database,
    request: PluginEntityScope & { kind: string; key: string }
  ): PluginEntityRecord | null {
    this.assertScope(db, request);
    const row = db
      .prepare(`${BASE_SQL} WHERE e.plugin_id = ? AND e.kind = ? AND e.key = ?`)
      .get(request.pluginId, request.kind, request.key) as Row | undefined;
    return row ? toRecord(row) : null;
  }

  /** 按创建时间倒序分页，游标为「创建时间:ID」 */
  static query(
    db: Database.Database,
    request: PluginEntityScope & { query: PluginEntityQuery }
  ): PluginEntityPage {
    this.assertScope(db, request);
    const { query } = request;
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT)
      throw new Error(`limit 必须是 1–${MAX_LIMIT} 的整数`);
    const where = ["e.plugin_id = ?"];
    const params: unknown[] = [request.pluginId];
    if (query.kind !== undefined) {
      where.push("e.kind = ?");
      params.push(query.kind);
    }
    if (query.cursor !== undefined) {
      const match = /^(\d+):(\d+)$/.exec(String(query.cursor));
      if (!match) throw new Error("分页游标无效");
      where.push("(e.create_time < ? OR (e.create_time = ? AND e.id < ?))");
      params.push(Number(match[1]), Number(match[1]), Number(match[2]));
    }
    const rows = db
      .prepare(
        `${BASE_SQL} WHERE ${where.join(" AND ")} ORDER BY e.create_time DESC, e.id DESC LIMIT ?`
      )
      .all(...params, query.limit + 1) as Row[];
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toRecord),
      ...(rows.length > query.limit && last ? { cursor: `${last.create_time}:${last.id}` } : {}),
    };
  }

  static update(
    db: Database.Database,
    request: PluginEntityScope & { id: number; patch: PluginEntityPatch; expectedRevision: string }
  ): PluginEntityRecord {
    this.assertScope(db, request);
    return db.transaction(() => {
      const current = this.row(db, request.pluginId, request.id);
      if (!current) throw new Error("内容不存在");
      if (String(current.update_time) !== request.expectedRevision)
        throw new Error(`${CONFLICT_PREFIX}数据已被修改，请重新读取后再试`);
      const { title, meta } = request.patch;
      // 同一毫秒内连续修改也要换出新的 revision
      const now = Math.max(Date.now(), current.update_time + 1);
      db.prepare(
        "UPDATE plugin_entities SET title = ?, meta = ?, update_time = ? WHERE id = ?"
      ).run(
        title ?? current.title,
        meta === undefined ? current.meta : JSON.stringify(meta),
        now,
        request.id
      );
      return toRecord(this.row(db, request.pluginId, request.id) as Row);
    })();
  }

  /**
   * 全文 / 向量索引的文档：所有插件（含已停用、宽限期内已卸载）的实体，标题与解析后的正文。
   * 传 id 时只取一项，供正文写入后的增量索引。
   */
  static indexDocs(db: Database.Database, id?: number): PluginEntityIndexDoc[] {
    const rows = db
      .prepare(
        `SELECT e.id, e.title, MAX(e.update_time, ct.update_time) AS update_time, ct.content
         FROM plugin_entities e JOIN contents ct ON ct.id = e.content_id
         ${id === undefined ? "" : "WHERE e.id = ?"}`
      )
      .all(...(id === undefined ? [] : [id])) as Array<{
      id: number;
      title: string;
      update_time: number;
      content: string;
    }>;
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      updateTime: row.update_time,
      content: parseContent(row.content),
    }));
  }

  /** 以这份正文为自有内容的插件实体：插件读写自己的正文不需要业务权限 */
  static pluginOwners(db: Database.Database, contentId: number): PluginContentOwner[] {
    return (
      db
        .prepare("SELECT plugin_id, id, title FROM plugin_entities WHERE content_id = ?")
        .all(contentId) as Array<{ plugin_id: string; id: number; title: string }>
    ).map(row => ({ pluginId: row.plugin_id, id: row.id, title: row.title }));
  }

  /**
   * 开库维护：插件目录已不在的实体记孤儿时间，目录重新出现或插件再次读写实体即撤销；
   * 孤儿超过宽限期的实体删除并延迟释放正文。installed 为 null（读不到插件目录）时不标记。
   */
  static collectOrphans(
    db: Database.Database,
    options: { installed: ReadonlySet<string> | null; now: number; graceMs: number }
  ): number {
    return db.transaction(() => {
      if (options.installed) {
        const pluginIds = (
          db.prepare("SELECT DISTINCT plugin_id FROM plugin_entities").all() as Array<{
            plugin_id: string;
          }>
        ).map(row => row.plugin_id);
        const mark = db.prepare(
          "UPDATE plugin_entities SET orphaned_time = ? WHERE plugin_id = ? AND orphaned_time IS NULL"
        );
        const adopt = db.prepare(
          "UPDATE plugin_entities SET orphaned_time = NULL WHERE plugin_id = ? AND orphaned_time IS NOT NULL"
        );
        for (const pluginId of pluginIds)
          if (options.installed.has(pluginId)) adopt.run(pluginId);
          else mark.run(options.now, pluginId);
      }
      const due = db
        .prepare(
          "SELECT id, content_id FROM plugin_entities WHERE orphaned_time IS NOT NULL AND orphaned_time <= ?"
        )
        .all(options.now - options.graceMs) as Array<{ id: number; content_id: number }>;
      const remove = db.prepare("DELETE FROM plugin_entities WHERE id = ?");
      for (const row of due) {
        remove.run(row.id);
        ContentTable.releaseDeferred(db, row.content_id);
      }
      return due.length;
    })();
  }
}
