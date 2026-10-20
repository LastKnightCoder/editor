/**
 * 业务数据变更事件（插件 context.events 的来源）。
 *
 * 每个主库连接装一组 TEMP 触发器，经自定义函数把卡片 / 文章 / 项目文档 / 正文的增删改记到内存，
 * 合并后广播 `domain-events`；无论写入来自 IPC、协作投影还是后台模块都能覆盖。触发器在事务内
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
import { contentOrigin, currentPluginOrigin } from "./domain-event-origin";
import type { DomainEventMessage, DomainEventRecord } from "@/types/domain-events";

type Entity = "card" | "article" | "document";
type Action = "created" | "updated" | "deleted";

const FUNCTION_NAME = "tau_domain_change";
const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 2000;

/** 引用型项目条目只是入口，不作为项目文档；文章软删按删除处理 */
const TRIGGERS_SQL = `
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_cards_ins AFTER INSERT ON main.cards
  BEGIN SELECT ${FUNCTION_NAME}('card', NEW.id, 'created'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_cards_upd AFTER UPDATE ON main.cards
  BEGIN SELECT ${FUNCTION_NAME}('card', NEW.id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_cards_del AFTER DELETE ON main.cards
  BEGIN SELECT ${FUNCTION_NAME}('card', OLD.id, 'deleted'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_articles_ins AFTER INSERT ON main.articles
  WHEN NEW.is_delete = 0
  BEGIN SELECT ${FUNCTION_NAME}('article', NEW.id, 'created'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_articles_upd AFTER UPDATE ON main.articles
  BEGIN SELECT ${FUNCTION_NAME}('article', NEW.id,
    CASE WHEN NEW.is_delete = 1 AND OLD.is_delete = 0 THEN 'deleted'
         WHEN NEW.is_delete = 0 AND OLD.is_delete = 1 THEN 'created'
         WHEN NEW.is_delete = 1 THEN NULL
         ELSE 'updated' END); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_articles_del AFTER DELETE ON main.articles
  WHEN OLD.is_delete = 0
  BEGIN SELECT ${FUNCTION_NAME}('article', OLD.id, 'deleted'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_items_ins AFTER INSERT ON main.project_item
  WHEN NEW.ref_type IS NULL OR NEW.ref_type = ''
  BEGIN SELECT ${FUNCTION_NAME}('document', NEW.id, 'created'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_items_upd AFTER UPDATE ON main.project_item
  WHEN NEW.ref_type IS NULL OR NEW.ref_type = ''
  BEGIN SELECT ${FUNCTION_NAME}('document', NEW.id, 'updated'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_items_del AFTER DELETE ON main.project_item
  WHEN OLD.ref_type IS NULL OR OLD.ref_type = ''
  BEGIN SELECT ${FUNCTION_NAME}('document', OLD.id, 'deleted'); END;
CREATE TEMP TRIGGER IF NOT EXISTS tau_de_contents_upd AFTER UPDATE OF content ON main.contents
  BEGIN SELECT ${FUNCTION_NAME}('content', NEW.id, 'updated'); END;
`;

/** 已有的库级通知 → 集合级事件 */
const COLLECTION_CHANNELS: Record<string, DomainEventRecord["type"][]> = {
  "schedule:changed": ["todos.changed", "calendar.changed"],
  "task-assistant:changed": ["todos.changed", "calendar.changed"],
  "doc-tasks:changed": ["todos.changed"],
};

interface Pending {
  entities: Map<string, { entity: Entity; id: number; action: Action; pluginId?: string }>;
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
      db.function(FUNCTION_NAME, { deterministic: false }, (entity, id, action) => {
        if (typeof id === "number" || typeof id === "bigint")
          this.record(dbName, String(entity), Number(id), action as Action | null);
        return null;
      });
      db.exec(TRIGGERS_SQL);
      this.installed.add(db);
    } catch (error) {
      log.error(`[domain-events] 安装触发器失败: db=${dbName}`, error);
    }
  }

  private record(dbName: string, entity: string, id: number, action: Action | null) {
    if (!action) return;
    const pending = this.queue(dbName);
    // 同一项在窗口内被多方修改时，以最后一次写入的来源为准
    if (entity === "content") {
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
      });
    else pending.entities.delete(key);
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
      // 正文修改计入所属实体的 updated
      if (db && pending.contents.size)
        for (const [contentId, refs] of EntitySearchTable.locateAll(db, [
          ...pending.contents.keys(),
        ]))
          for (const ref of refs) {
            const entity: Entity | null =
              ref.kind === "project-item"
                ? "document"
                : ref.kind === "card" || ref.kind === "article"
                  ? ref.kind
                  : null;
            if (entity && !pending.entities.has(`${entity}:${ref.id}`))
              pending.entities.set(`${entity}:${ref.id}`, {
                entity,
                id: ref.id,
                action: "updated",
                pluginId: pending.contents.get(contentId),
              });
          }
      for (const { entity, id, action, pluginId } of pending.entities.values())
        events.push({ type: `${entity}.${action}`, id, at, ...(pluginId ? { pluginId } : {}) });
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
