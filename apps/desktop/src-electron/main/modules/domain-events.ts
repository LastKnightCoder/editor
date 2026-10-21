/**
 * 业务数据变更事件（插件 context.events 的来源）。
 *
 * 每个主库连接装一组 TEMP 触发器，经自定义函数把卡片、文章、项目文档、白板、项目、Notebook、
 * 材料、对话、插件实体与记录、正文的增删改记到内存，合并后广播 `domain-events`；无论写入来自 IPC、协作投影还是后台模块都能覆盖。触发器在事务内
 * 执行，回滚的写入也可能产生事件——事件只说明「哪一项可能变了」，订阅方重新读取即可。
 * 待办与日程沿用已有的库级通知，只给集合级变化。
 */

import { BrowserWindow } from "electron";
import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule from "./database";
import { onDatabaseChangeBroadcast } from "./database-notifications";
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
  // Notebook 的资料清单计入 Notebook 的 updated；资料转换、转写的进度不算
  `CREATE TEMP TRIGGER IF NOT EXISTS tau_de_resources_ins AFTER INSERT ON main.vibe_learning_resources
  BEGIN SELECT ${FUNCTION_NAME}('notebook', NEW.project_id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_resources_upd AFTER UPDATE ON main.vibe_learning_resources
  WHEN ${anyChanged(["name", "resource_type", "source_type", "source_meta_info", "file_size", "duration", "sort_index"])}
  BEGIN SELECT ${FUNCTION_NAME}('notebook', NEW.project_id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_resources_del AFTER DELETE ON main.vibe_learning_resources
  BEGIN SELECT ${FUNCTION_NAME}('notebook', OLD.project_id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_contents_upd AFTER UPDATE OF content ON main.contents
  BEGIN SELECT ${FUNCTION_NAME}('content', NEW.id, 'updated'); END;`,
].join("\n");

/** 已有的库级通知 → 集合级事件 */
const COLLECTION_CHANNELS: Record<string, DomainEventRecord["type"][]> = {
  "schedule:changed": ["todos.changed", "calendar.changed"],
  "task-assistant:changed": ["todos.changed", "calendar.changed"],
  "doc-tasks:changed": ["todos.changed"],
};

interface Change {
  entity: Entity;
  id: number | string;
  action: Action;
  pluginId?: string;
  /** 插件实体、记录的所属插件；kind 为实体类型或记录集合 */
  owner?: string;
  kind?: string;
}

interface Pending {
  entities: Map<string, Change>;
  /** 正文 ID → 写入它的插件（没有为 undefined） */
  contents: Map<number, string | undefined>;
  collections: Set<DomainEventRecord["type"]>;
  reset: boolean;
  since: number;
  timer?: NodeJS.Timeout;
}

/** 同一项在一个窗口内的多次变化合并：先建后删即无事发生，先建后改仍是新建 */
function merge(previous: Action | undefined, next: Action): Action | null {
  if (!previous) return next;
  if (previous === "created") return next === "deleted" ? null : "created";
  if (previous === "deleted") return next === "created" ? "updated" : "deleted";
  return next === "deleted" ? "deleted" : "updated";
}

class DomainEventsModule implements Module {
  name = "domain-events";
  private readonly pending = new Map<string, Pending>();
  private readonly installed = new WeakSet<Database.Database>();

  async init() {
    databaseModule.onDatabaseConnected((dbName, reason) => {
      this.pending.delete(dbName);
      this.install(dbName);
      // 同步下载替换了整个库，订阅方需要全量刷新
      if (reason === "sync_download_reconnect" || reason === "reconnect")
        this.queue(dbName).reset = true;
    });
    onDatabaseChangeBroadcast((channel, dbName) => {
      const types = COLLECTION_CHANNELS[channel];
      if (types) for (const type of types) this.queue(dbName).collections.add(type);
    });
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
          if (typeof key === "number" || typeof key === "string")
            this.record(dbName, String(entity), key, action as Action | null, {
              ...(typeof owner === "string" ? { owner } : {}),
              ...(typeof kind === "string" ? { kind } : {}),
            });
          return null;
        }
      );
      db.exec(TRIGGERS_SQL);
      this.installed.add(db);
    } catch (error) {
      log.error(`[domain-events] 安装触发器失败: db=${dbName}`, error);
    }
  }

  private record(
    dbName: string,
    entity: string,
    id: number | string,
    action: Action | null,
    owned: Pick<Change, "owner" | "kind">
  ) {
    if (!action) return;
    const pending = this.queue(dbName);
    // 同一项在窗口内被多方修改时，以最后一次写入的来源为准
    if (entity === "content") {
      if (typeof id === "number")
        pending.contents.set(id, currentPluginOrigin() ?? contentOrigin(dbName, id));
      return;
    }
    const key = `${entity}:${id}`;
    const merged = merge(pending.entities.get(key)?.action, action);
    if (merged)
      pending.entities.set(key, {
        entity: entity as Entity,
        id,
        action: merged,
        pluginId: currentPluginOrigin(),
        ...owned,
      });
    else pending.entities.delete(key);
  }

  /** 正文修改计入所属实体的 updated；孤儿插件实体与日记不发事件 */
  private locateContents(db: Database.Database, pending: Pending) {
    const ownerOf = db.prepare(
      "SELECT plugin_id AS owner, kind FROM plugin_entities WHERE id = ? AND orphaned_time IS NULL"
    );
    for (const [contentId, refs] of EntitySearchTable.locateAll(db, [...pending.contents.keys()]))
      for (const ref of refs) {
        let change: Pick<Change, "entity" | "owner" | "kind"> | undefined;
        if (ref.kind === "project-item") change = { entity: "document" };
        else if (ref.kind === "card" || ref.kind === "article") change = { entity: ref.kind };
        else if (ref.kind === "plugin-entity") {
          const owned = ownerOf.get(ref.id) as { owner: string; kind: string } | undefined;
          if (owned) change = { entity: "entity", ...owned };
        }
        const key = change && `${change.entity}:${ref.id}`;
        if (change && key && !pending.entities.has(key))
          pending.entities.set(key, {
            ...change,
            id: ref.id,
            action: "updated",
            pluginId: pending.contents.get(contentId),
          });
      }
  }

  private queue(dbName: string): Pending {
    let pending = this.pending.get(dbName);
    if (!pending) {
      pending = {
        entities: new Map(),
        contents: new Map(),
        collections: new Set(),
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
    this.pending.delete(dbName);
    const at = Date.now();
    const events: DomainEventRecord[] = [];
    if (pending.reset) events.push({ type: "workspace.reset", at });
    else {
      const db = databaseModule.getDatabase(dbName);
      if (db && pending.contents.size) this.locateContents(db, pending);
      for (const { entity, id, action, pluginId, owner, kind } of pending.entities.values())
        events.push({
          type: `${entity}.${action}`,
          id,
          at,
          ...(pluginId ? { pluginId } : {}),
          ...(owner ? { owner } : {}),
          ...(kind ? (entity === "record" ? { collection: kind } : { kind }) : {}),
        });
      for (const type of pending.collections) events.push({ type, at });
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
  }
}

export default new DomainEventsModule();
