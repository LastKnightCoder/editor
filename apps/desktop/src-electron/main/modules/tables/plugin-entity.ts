import Database from "better-sqlite3";
import { basename } from "node:path";
import type { Descendant } from "slate";
import type { PluginContentOwner } from "@/types/plugin-data";
import type {
  PluginEntityCreate,
  PluginEntityKindAppearance,
  PluginEntityOwner,
  PluginEntityPage,
  PluginEntityPatch,
  PluginEntityQuery,
  PluginEntityRecord,
  PluginEntityScope,
} from "@/types/plugin-entities";
import ContentTable from "./content";
import { getNextTaskEntityId } from "./module-entity-id";
import { insertPluginOperation } from "./plugin-operations";
import { emitContentWritten } from "../content-events";

const MAX_LIMIT = 200;
const MAX_OWNER_IDS = 500;
const MAX_KIND_LABEL = 50;
/** 宿主渲染出的图标 SVG 上限；只作 CSS 遮罩显示，不当作 HTML 插入 */
export const MAX_KIND_ICON = 16 * 1024;
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
      "plugin-entities:delete": this.remove.bind(this),
      "plugin-entities:locate": this.locate.bind(this),
      "plugin-entities:owners": this.owners.bind(this),
      "plugin-entities:declare-kind": this.declareKind.bind(this),
      "plugin-entities:kinds": this.kinds.bind(this),
    };
  }

  private static assertDatabase(db: Database.Database, databaseName: string) {
    if (basename(db.name).replace(/\.db$/, "") !== databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
  }

  private static assertScope(db: Database.Database, scope: PluginEntityScope) {
    this.assertDatabase(db, scope.databaseName);
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
    this.assertDatabase(db, request.databaseName);
    return this.byId(db, request.id);
  }

  /** 一批插件内容所属的插件与类型，供各处按声明的外观显示；不存在的 ID 不返回 */
  static owners(
    db: Database.Database,
    request: { databaseName: string; ids: number[] }
  ): PluginEntityOwner[] {
    this.assertDatabase(db, request.databaseName);
    const ids = [...new Set(request.ids)].filter(id => Number.isSafeInteger(id) && id > 0);
    if (ids.length > MAX_OWNER_IDS) throw new Error(`一次最多查询 ${MAX_OWNER_IDS} 项`);
    if (!ids.length) return [];
    return (
      db
        .prepare(
          `SELECT id, plugin_id, kind FROM plugin_entities WHERE id IN (${ids.map(() => "?").join(",")})`
        )
        .all(...ids) as Array<{ id: number; plugin_id: string; kind: string }>
    ).map(row => ({ id: row.id, pluginId: row.plugin_id, kind: row.kind }));
  }

  /** 保存插件声明的类型外观；与库里一致时不写入。返回是否有变化 */
  static declareKind(
    db: Database.Database,
    request: PluginEntityScope & PluginEntityKindAppearance
  ): boolean {
    this.assertDatabase(db, request.databaseName);
    const { pluginId, kind, label, icon } = request;
    if (typeof pluginId !== "string" || !pluginId) throw new Error("插件 ID 无效");
    if (typeof kind !== "string" || !kind) throw new Error("类型无效");
    if (typeof label !== "string" || !label.trim() || label.length > MAX_KIND_LABEL)
      throw new Error("类型名无效");
    if (
      typeof icon !== "string" ||
      icon.length > MAX_KIND_ICON ||
      (icon && !/^<svg[\s>]/.test(icon))
    )
      throw new Error("图标无效");
    const current = db
      .prepare("SELECT label, icon FROM plugin_entity_kinds WHERE plugin_id = ? AND kind = ?")
      .get(pluginId, kind) as { label: string; icon: string } | undefined;
    if (current?.label === label && current.icon === icon) return false;
    db.prepare(
      `INSERT INTO plugin_entity_kinds (plugin_id, kind, label, icon, update_time) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(plugin_id, kind) DO UPDATE SET label = excluded.label, icon = excluded.icon,
         update_time = excluded.update_time`
    ).run(pluginId, kind, label, icon, Date.now());
    return true;
  }

  /** 库里保存的全部类型外观（每个插件寥寥数种），插件不在运行时也据此显示 */
  static kinds(
    db: Database.Database,
    request: { databaseName: string }
  ): Array<PluginEntityKindAppearance & { pluginId: string }> {
    this.assertDatabase(db, request.databaseName);
    return (
      db.prepare("SELECT plugin_id, kind, label, icon FROM plugin_entity_kinds").all() as Array<{
        plugin_id: string;
        kind: string;
        label: string;
        icon: string;
      }>
    ).map(row => ({ pluginId: row.plugin_id, kind: row.kind, label: row.label, icon: row.icon }));
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
      // 编号不复用：删除后恢复仍用原 ID，正文里指向它的引用不会落到别的内容上
      const id = getNextTaskEntityId(db, "plugin_entities");
      db.prepare(
        `INSERT INTO plugin_entities
           (id, plugin_id, kind, key, title, content_id, meta, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, request.pluginId, kind, key, title, contentId, JSON.stringify(meta), now, now);
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

  /** 删除前把行快照存入 plugin_operations，正文延迟释放；7 天内可由用户在插件详情页恢复 */
  static remove(
    db: Database.Database,
    request: PluginEntityScope & { id: number; expectedRevision: string }
  ): void {
    this.assertScope(db, request);
    db.transaction(() => {
      const current = this.row(db, request.pluginId, request.id);
      if (!current) throw new Error("内容不存在");
      if (String(current.update_time) !== request.expectedRevision)
        throw new Error(`${CONFLICT_PREFIX}数据已被修改，请重新读取后再试`);
      const row = db.prepare("SELECT * FROM plugin_entities WHERE id = ?").get(request.id);
      db.prepare("DELETE FROM plugin_entities WHERE id = ?").run(request.id);
      ContentTable.releaseDeferred(db, current.content_id);
      insertPluginOperation(db, {
        pluginId: request.pluginId,
        entity: "plugin-entity",
        entityId: String(request.id),
        title: current.title,
        payload: { row, contentCreatedAt: current.content_created },
      });
    })();
  }

  /** 按删除快照恢复：ID 与 key 不变，正文重新持有引用并重建派生索引；返回恢复后的 ID */
  static restoreDeleted(
    db: Database.Database,
    snapshot: { row: Record<string, unknown>; contentCreatedAt: number }
  ): number {
    const { row } = snapshot;
    const id = Number(row.id);
    const contentId = Number(row.content_id);
    db.transaction(() => {
      if (db.prepare("SELECT 1 FROM plugin_entities WHERE id = ?").get(id))
        throw new Error("这项内容已经存在");
      if (
        db
          .prepare("SELECT 1 FROM plugin_entities WHERE plugin_id = ? AND kind = ? AND key = ?")
          .get(row.plugin_id, row.kind, row.key)
      )
        throw new Error("插件已重新创建了同一项内容，无法恢复");
      const content = db.prepare("SELECT create_time FROM contents WHERE id = ?").get(contentId) as
        { create_time: number } | undefined;
      if (!content || content.create_time !== snapshot.contentCreatedAt)
        throw new Error("正文已被清理，无法恢复");
      ContentTable.retain(db, contentId);
      db.prepare(
        `INSERT INTO plugin_entities
           (id, plugin_id, kind, key, title, content_id, meta, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        row.plugin_id,
        row.kind,
        row.key,
        row.title,
        contentId,
        row.meta,
        row.create_time,
        row.update_time
      );
    })();
    // 让全文、引用等派生索引重新收录这份正文
    emitContentWritten(db, contentId, "update");
    return id;
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
      // 已卸载且内容已清空的插件不再需要类型外观
      if (options.installed) {
        const installed = options.installed;
        const stale = (
          db
            .prepare(
              `SELECT DISTINCT plugin_id FROM plugin_entity_kinds
               WHERE plugin_id NOT IN (SELECT plugin_id FROM plugin_entities)`
            )
            .all() as Array<{ plugin_id: string }>
        ).filter(row => !installed.has(row.plugin_id));
        const forget = db.prepare("DELETE FROM plugin_entity_kinds WHERE plugin_id = ?");
        for (const row of stale) forget.run(row.plugin_id);
      }
      return due.length;
    })();
  }
}
