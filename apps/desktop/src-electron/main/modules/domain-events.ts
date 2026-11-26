/**
 * 业务数据变更事件（插件 context.events 的来源）。
 *
 * 每个主库连接装一组 TEMP 触发器，经自定义函数把卡片、文章、项目文档、白板、项目、Notebook、
 * 材料、对话、插件实体与记录、正文的增删改记到内存，合并后广播 `domain-events`；无论写入来自 IPC、协作投影还是后台模块都能覆盖。触发器在事务内
 * 执行并写入事务性的 TEMP 队列，提交后合并广播；回滚自动清掉队列。
 * 待办、日程与目录按已提交的持久变化日志分页广播对象身份。
 */

import { BrowserWindow } from "electron";
import log from "electron-log";
import type Database from "better-sqlite3";
import DataChangeEventsTable from "./tables/data-change-events";
import { Module } from "../types/module";
import databaseModule from "./database";
import { broadcastDatabaseChange, onDatabaseChangeBroadcast } from "./database-notifications";
import EntitySearchTable from "./tables/entity-search";
import { PLUGIN_CHAT_SCOPES_SQL } from "./tables/plugin-data-readonly";
import { contentOrigin, currentPluginOrigin } from "./domain-event-origin";
import type { DomainEventMessage, DomainEventRecord } from "@/types/domain-events";

type Entity =
  | "card"
  | "article"
  | "document"
  | "whiteboard"
  | "project"
  | "notebook"
  | "material"
  | "chat"
  | "entity"
  | "record";
type Action = "created" | "updated" | "deleted";

const FUNCTION_NAME = "tau_domain_change";
const QUEUE_TABLE = "tau_domain_event_queue";
const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 2000;

/** 一张表的行级事件；row 为 NEW 或 OLD */
interface RowTriggers {
  name: string;
  table: string;
  entity: Entity;
  /** 事件 ID，缺省为行 ID */
  id?: (row: string) => string;
  /** 对插件可见的行 */
  visible?: (row: string) => string;
  /** 软删除：为真即按已删除处理 */
  removed?: (row: string) => string;
  /** 附加参数：插件实体的所属插件与类型、插件记录的所属插件与集合 */
  extra?: (row: string) => string;
  /** 修改时只在这些列变化才算 updated；打开时间、当前页等查看状态的写入不算。缺省为任一列 */
  changed?: string[];
}

const anyChanged = (columns: string[]) =>
  `(${columns.map(column => `OLD.${column} IS NOT NEW.${column}`).join(" OR ")})`;

function rowTriggers(spec: RowTriggers): string {
  const id = spec.id ?? (row => `${row}.id`);
  const args = (row: string, action: string) =>
    `${FUNCTION_NAME}('${spec.entity}', ${id(row)}, ${action}${spec.extra ? `, ${spec.extra(row)}` : ""})`;
  const when = (row: string, live: boolean) => {
    const conditions = [
      spec.visible?.(row),
      live && spec.removed ? `NOT (${spec.removed(row)})` : undefined,
      !live && spec.changed ? anyChanged(spec.changed) : undefined,
    ].filter(Boolean);
    return conditions.length ? `\n  WHEN ${conditions.join(" AND ")}` : "";
  };
  const removed = spec.removed;
  const updateAction = removed
    ? `CASE WHEN (${removed("NEW")}) AND NOT (${removed("OLD")}) THEN 'deleted'
         WHEN NOT (${removed("NEW")}) AND (${removed("OLD")}) THEN 'created'
         WHEN (${removed("NEW")}) THEN NULL
         ELSE 'updated' END`
    : "'updated'";
  const trigger = (suffix: string, event: string, row: string, live: boolean, action: string) =>
    `CREATE TEMP TRIGGER IF NOT EXISTS tau_de_${spec.name}_${suffix} AFTER ${event} ON main.${spec.table}${when(row, live)}
  BEGIN SELECT ${args(row, action)}; END;`;
  return [
    trigger("ins", "INSERT", "NEW", true, "'created'"),
    trigger("upd", "UPDATE", "NEW", false, updateAction),
    trigger("del", "DELETE", "OLD", true, "'deleted'"),
  ].join("\n");
}

/**
 * 引用型项目条目只是入口，不作为项目文档；文章、划线软删按删除处理；插件实体在插件卸载后成为孤儿，
 * 按删除处理，重装恢复时按新建处理。
 */
const TRIGGERS_SQL = [
  rowTriggers({ name: "cards", table: "cards", entity: "card" }),
  rowTriggers({
    name: "articles",
    table: "articles",
    entity: "article",
    removed: row => `${row}.is_delete = 1`,
  }),
  rowTriggers({
    name: "items",
    table: "project_item",
    entity: "document",
    visible: row => `(${row}.ref_type IS NULL OR ${row}.ref_type = '')`,
  }),
  rowTriggers({
    name: "boards",
    table: "white_boards",
    entity: "whiteboard",
    changed: ["title", "description", "tags", "white_board_content_ids", "update_time"],
  }),
  rowTriggers({
    name: "projects",
    table: "project",
    entity: "project",
    changed: ["title", "archived", "pinned", "children", "update_time"],
  }),
  rowTriggers({
    name: "notebooks",
    table: "vibe_learning_project",
    entity: "notebook",
    changed: ["title", "archived", "pinned", "update_time"],
  }),
  rowTriggers({
    name: "excerpts",
    table: "excerpt",
    entity: "material",
    id: row => `'excerpt:' || ${row}.id`,
    removed: row => `${row}.is_deleted = 1`,
  }),
  rowTriggers({
    name: "annotations",
    table: "pdf_annotations",
    entity: "material",
    id: row => `'pdf-annotation:' || ${row}.id`,
  }),
  rowTriggers({
    name: "clips",
    table: "web_clip",
    entity: "material",
    id: row => `'web-clip:' || ${row}.id`,
  }),
  rowTriggers({
    name: "chats",
    table: "chat_session",
    entity: "chat",
    visible: row => `${row}.scope IN (${PLUGIN_CHAT_SCOPES_SQL})`,
    changed: ["title", "archived", "message_count", "update_time"],
  }),
  rowTriggers({
    name: "plugin_entities",
    table: "plugin_entities",
    entity: "entity",
    removed: row => `${row}.orphaned_time IS NOT NULL`,
    extra: row => `${row}.plugin_id, ${row}.kind`,
    changed: ["title", "meta", "update_time", "orphaned_time"],
  }),
  rowTriggers({
    name: "plugin_records",
    table: "plugin_records",
    entity: "record",
    removed: row => `${row}.orphaned_time IS NOT NULL`,
    extra: row => `${row}.plugin_id, ${row}.collection`,
    changed: ["data", "update_time", "orphaned_time"],
  }),
  // 插件关联的增删与重排计入来源实体的 updated
  ...["INSERT", "UPDATE", "DELETE"].map(event => {
    const row = event === "DELETE" ? "OLD" : "NEW";
    return `CREATE TEMP TRIGGER IF NOT EXISTS tau_de_plugin_links_${event.toLowerCase()} AFTER ${event} ON main.plugin_links
  BEGIN SELECT ${FUNCTION_NAME}('entity', ${row}.from_id, 'updated', ${row}.plugin_id,
    (SELECT kind FROM main.plugin_entities WHERE id = ${row}.from_id)); END;`;
  }),
  // Notebook 的资料清单计入 Notebook 的 updated；资料转换、转写的进度不算
  `CREATE TEMP TRIGGER IF NOT EXISTS tau_de_resources_ins AFTER INSERT ON main.vibe_learning_resources
  BEGIN SELECT ${FUNCTION_NAME}('notebook', NEW.project_id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_resources_upd AFTER UPDATE ON main.vibe_learning_resources
  WHEN ${anyChanged(["name", "resource_type", "source_type", "source_meta_info", "file_size", "duration", "sort_index"])}
  BEGIN SELECT ${FUNCTION_NAME}('notebook', NEW.project_id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_resources_del AFTER DELETE ON main.vibe_learning_resources
  BEGIN SELECT ${FUNCTION_NAME}('notebook', OLD.project_id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_contents_upd AFTER UPDATE OF content ON main.contents
  WHEN OLD.content IS NOT NEW.content
  BEGIN SELECT ${FUNCTION_NAME}('content', NEW.id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_content_blocks_upd AFTER UPDATE OF update_time ON main.contents
  WHEN NEW.content IS NULL
  BEGIN SELECT ${FUNCTION_NAME}('content', NEW.id, 'updated'); END;`,
]
  .join("\n")
  .replaceAll(
    `SELECT ${FUNCTION_NAME}(`,
    `INSERT INTO ${QUEUE_TABLE}(payload) SELECT ${FUNCTION_NAME}(`
  );

/** 内部通知仅唤醒已提交日志，不制造对象或第二种公开事件。 */
const WAKE_CHANNELS = new Set(["schedule:changed", "task-assistant:changed", "doc-tasks:changed"]);

interface Change {
  entity: Entity;
  id: number | string;
  action: Action;
  pluginId?: string;
  /** 插件实体、记录的所属插件；kind 为实体类型或记录集合 */
  owner?: string;
  kind?: string;
}

const changeKey = (entity: string, id: number | string, owner?: string) =>
  JSON.stringify([entity, id, owner ?? null]);

interface Pending {
  entities: Map<string, Change>;
  /** 正文 ID → 写入它的插件（没有为 undefined） */
  contents: Map<number, string | undefined>;
  reset: boolean;
  since: number;
  timer?: NodeJS.Timeout;
}

/** 同一项在一个窗口内的多次变化合并：先建后删保留删除身份，先建后改仍是新建 */
function merge(previous: Action | undefined, next: Action): Action | null {
  if (!previous) return next;
  if (previous === "created") return next === "deleted" ? "deleted" : "created";
  if (previous === "deleted") return next === "created" ? "updated" : "deleted";
  return next === "deleted" ? "deleted" : "updated";
}

class DomainEventsModule implements Module {
  name = "domain-events";
  private readonly pending = new Map<string, Pending>();
  private readonly installed = new WeakSet<Database.Database>();
  private readonly objectCursors = new Map<string, { db: Database.Database; after: number }>();
  private poll?: ReturnType<typeof setInterval>;

  async init() {
    databaseModule.onDatabaseConnected((dbName, reason) => {
      this.pending.delete(dbName);
      this.install(dbName);
      // 同步下载替换了整个库，订阅方需要全量刷新
      if (reason === "sync_download_reconnect" || reason === "reconnect")
        this.queue(dbName).reset = true;
    });
    onDatabaseChangeBroadcast((channel, dbName) => {
      if (WAKE_CHANNELS.has(channel)) this.queue(dbName);
    });
    if (!this.poll) {
      this.poll = setInterval(() => {
        for (const [name, state] of this.objectCursors) {
          const db = databaseModule.getDatabase(name);
          if (!db?.open || db !== state.db) {
            this.objectCursors.delete(name);
            continue;
          }
          if (db.inTransaction) continue;
          try {
            if (DataChangeEventsTable.head(db) !== state.after) this.queue(name);
          } catch (error) {
            log.warn("[domain-events] 读取对象事件水位失败", error);
          }
        }
      }, 2000);
      this.poll.unref?.();
    }
  }

  private install(dbName: string) {
    const db = databaseModule.getDatabase(dbName);
    if (!db || this.installed.has(db)) return;
    try {
      db.function(
        FUNCTION_NAME,
        { deterministic: false, varargs: true },
        (entity, id, action, owner, kind) => {
          const key = typeof id === "bigint" ? Number(id) : id;
          this.queue(dbName);
          if (entity === "schedule-domain") return null;
          return JSON.stringify({
            entity: String(entity),
            id: key,
            action,
            pluginId:
              currentPluginOrigin() ??
              (entity === "content" && typeof key === "number"
                ? contentOrigin(dbName, key)
                : undefined),
            ...(typeof owner === "string" ? { owner } : {}),
            ...(typeof kind === "string" ? { kind } : {}),
          });
        }
      );
      db.exec(
        `CREATE TEMP TABLE IF NOT EXISTS ${QUEUE_TABLE}(seq INTEGER PRIMARY KEY,payload TEXT NOT NULL)`
      );
      db.exec(`CREATE TEMP TRIGGER IF NOT EXISTS tau_de_data_changes AFTER INSERT ON main.data_change_log
   WHEN NEW.domain IN ('todo','todo-list','event','calendar')
   BEGIN SELECT ${FUNCTION_NAME}('schedule-domain', NEW.domain, 'updated'); END;`);
      db.exec(TRIGGERS_SQL);
      this.objectCursors.set(dbName, { db, after: DataChangeEventsTable.head(db) });
      this.installed.add(db);
    } catch (error) {
      log.error(`[domain-events] 安装触发器失败: db=${dbName}`, error);
    }
  }

  private record(
    pending: Pending,
    entity: string,
    id: number | string,
    action: Action | null,
    owned: Pick<Change, "owner" | "kind" | "pluginId">
  ) {
    if (!action) return;
    // 同一项在窗口内被多方修改时，以最后一次写入的来源为准
    if (entity === "content") {
      if (typeof id === "number") pending.contents.set(id, owned.pluginId);
      return;
    }
    const key = changeKey(entity, id, owned.owner);
    const previous = pending.entities.get(key);
    const merged = merge(previous?.action, action);
    if (merged)
      pending.entities.set(key, {
        entity: entity as Entity,
        id,
        action: merged,
        pluginId: owned.pluginId,
        owner: owned.owner ?? previous?.owner,
        kind: owned.kind ?? previous?.kind,
      });
    else pending.entities.delete(key);
  }

  /** 日记走专用通知，不进入插件业务事件。 */
  private locateContents(db: Database.Database, pending: Pending) {
    let diaryChanged = false;
    const ownerOf = db.prepare(
      "SELECT plugin_id AS owner, kind FROM plugin_entities WHERE id = ? AND orphaned_time IS NULL"
    );
    for (const [contentId, refs] of EntitySearchTable.locateAll(db, [...pending.contents.keys()]))
      for (const ref of refs) {
        if (ref.kind === "diary-moment") diaryChanged = true;
        let change: Pick<Change, "entity" | "owner" | "kind"> | undefined;
        if (ref.kind === "project-item") change = { entity: "document" };
        else if (ref.kind === "card" || ref.kind === "article") change = { entity: ref.kind };
        else if (ref.kind === "plugin-entity") {
          const owned = ownerOf.get(ref.id) as { owner: string; kind: string } | undefined;
          if (owned) change = { entity: "entity", ...owned };
        }
        const key = change && changeKey(change.entity, ref.id, change.owner);
        if (change && key && !pending.entities.has(key))
          pending.entities.set(key, {
            ...change,
            id: ref.id,
            action: "updated",
            pluginId: pending.contents.get(contentId),
          });
      }
    return diaryChanged;
  }

  private queue(dbName: string): Pending {
    let pending = this.pending.get(dbName);
    if (!pending) {
      pending = {
        entities: new Map(),
        contents: new Map(),
        reset: false,
        since: Date.now(),
      };
      this.pending.set(dbName, pending);
    }
    if (pending.timer) clearTimeout(pending.timer);
    const delay = Math.max(0, Math.min(DEBOUNCE_MS, pending.since + MAX_WAIT_MS - Date.now()));
    const current = pending;
    pending.timer = setTimeout(() => this.flush(dbName, current), delay);
    return pending;
  }

  private flush(dbName: string, pending: Pending) {
    if (this.pending.get(dbName) !== pending) return;
    const db = databaseModule.getDatabase(dbName);
    if (!db?.open) {
      this.pending.delete(dbName);
      return;
    }
    if (db.inTransaction) {
      pending.timer = setTimeout(() => this.flush(dbName, pending), 50);
      return;
    }
    try {
      const at = Date.now();
      const events: DomainEventRecord[] = [];
      let more = false;
      if (pending.reset) {
        db.prepare(`DELETE FROM ${QUEUE_TABLE}`).run();
        this.objectCursors.set(dbName, { db, after: DataChangeEventsTable.head(db) });
        events.push({ type: "workspace.reset", at });
      } else {
        const rows = db.transaction(() => {
          const rows = db
            .prepare(`SELECT seq,payload FROM ${QUEUE_TABLE} ORDER BY seq LIMIT 500`)
            .all() as { seq: number; payload: string }[];
          if (rows.length)
            db.prepare(`DELETE FROM ${QUEUE_TABLE} WHERE seq<=?`).run(rows[rows.length - 1].seq);
          return rows;
        })();
        more = rows.length === 500;
        for (const row of rows) {
          const item = JSON.parse(row.payload) as {
            entity: string;
            id: number | string;
            action: Action | null;
            pluginId?: string;
            owner?: string;
            kind?: string;
          };
          if (typeof item.id === "string" || typeof item.id === "number")
            this.record(pending, item.entity, item.id, item.action, item);
        }
        if (pending.contents.size && this.locateContents(db, pending))
          broadcastDatabaseChange("diary:changed", dbName);
        for (const { entity, id, action, pluginId, owner, kind } of pending.entities.values())
          events.push({
            type: `${entity}.${action}`,
            id,
            at,
            ...(pluginId ? { pluginId } : {}),
            ...(owner ? { owner } : {}),
            ...(kind ? (entity === "record" ? { collection: kind } : { kind }) : {}),
          });
        const state = this.objectCursors.get(dbName);
        if (state?.db === db) {
          const page = DataChangeEventsTable.read(db, state.after, at);
          state.after = page.cursor;
          if (page.reset) {
            events.length = 0;
            events.push({ type: "workspace.reset", at });
          } else events.push(...page.events);
          more ||= page.hasMore;
        }
      }
      this.pending.delete(dbName);
      if (more) {
        const next = this.queue(dbName);
        if (next.timer) clearTimeout(next.timer);
        next.timer = setTimeout(() => this.flush(dbName, next), 0);
      }
      if (!events.length) return;
      const message: DomainEventMessage = { databaseName: dbName, events };
      for (const window of BrowserWindow.getAllWindows()) {
        try {
          if (!window.isDestroyed()) window.webContents.send("domain-events", message);
        } catch (error) {
          log.warn("[domain-events] 广播失败", error);
        }
      }
    } catch (error) {
      log.warn("[domain-events] 提交事件读取失败", error);
      pending.reset = true;
      pending.timer = setTimeout(() => this.flush(dbName, pending), 500);
    }
  }
}

export default new DomainEventsModule();
