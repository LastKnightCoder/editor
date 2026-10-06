/**
 * pi 会话目录表：会话内容的事实源是 pi JSONL，本表只存列表与管理要用的轻量元数据，
 * **不存消息载荷**，所以列表查询是常数级的，不会把整库消息拉进内存。
 * id 即 pi 会话 id；scope + domain_ref 区分五个聊天场景与所属对象。
 *
 * 一行 = 一个对话 = 一个会话文件；分支在文件内部的会话树上。
 */
import Database from "better-sqlite3";
import { rmSync } from "node:fs";
import { chatSessionDirOfDb, resolveSessionFile } from "../pi-session-paths";
import type {
  ChatSessionInsert,
  ChatSessionListFilter,
  ChatSessionPatch,
  ChatSessionRow,
} from "@/types/chat-session";

interface RawRow {
  id: string;
  scope: string;
  domain_ref: string | null;
  session_file: string;
  cwd: string;
  title: string;
  title_dirty: number;
  group_id: number | null;
  order_num: number | null;
  archived: number;
  source: string;
  message_count: number;
  create_time: number;
  update_time: number;
}

const COLUMN_BY_FIELD: Record<keyof ChatSessionPatch, string> = {
  scope: "scope",
  domainRef: "domain_ref",
  sessionFile: "session_file",
  cwd: "cwd",
  title: "title",
  titleDirty: "title_dirty",
  groupId: "group_id",
  orderNum: "order_num",
  archived: "archived",
  source: "source",
  messageCount: "message_count",
  updateTime: "update_time",
};

const toSqlValue = (field: keyof ChatSessionPatch, value: unknown): unknown =>
  field === "titleDirty" || field === "archived" ? (value ? 1 : 0) : (value ?? null);

export default class ChatSessionTable {
  static upgradeTable(db: Database.Database) {
    // 建表语句与 schema 分片保持一致（存量库首次升级时这里负责建出来）
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_session (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        domain_ref TEXT,
        session_file TEXT NOT NULL,
        cwd TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        title_dirty INTEGER NOT NULL DEFAULT 0,
        group_id INTEGER,
        order_num INTEGER,
        archived INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'desktop',
        message_count INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_chat_session_scope ON chat_session(scope, domain_ref)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_chat_session_update_time ON chat_session(update_time)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_chat_session_group_id ON chat_session(group_id)");
  }

  static getListenEvents() {
    return {
      "chat-session:create": this.create.bind(this),
      "chat-session:update": this.update.bind(this),
      "chat-session:delete": this.remove.bind(this),
      "chat-session:get": this.getById.bind(this),
      "chat-session:list": this.list.bind(this),
      "chat-session:pin": this.pin.bind(this),
      "chat-session:unpin": this.unpin.bind(this),
    };
  }

  static parse(row: RawRow): ChatSessionRow {
    return {
      id: row.id,
      scope: row.scope,
      domainRef: row.domain_ref,
      sessionFile: row.session_file,
      cwd: row.cwd,
      title: row.title,
      titleDirty: Boolean(row.title_dirty),
      groupId: row.group_id,
      orderNum: row.order_num,
      archived: Boolean(row.archived),
      source: row.source === "browser" ? "browser" : "desktop",
      messageCount: row.message_count,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static create(db: Database.Database, input: ChatSessionInsert): ChatSessionRow {
    const now = Date.now();
    db.prepare(
      `INSERT INTO chat_session
         (id, scope, domain_ref, session_file, cwd, title, title_dirty, group_id, order_num,
          archived, source, message_count, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.id,
      input.scope,
      input.domainRef ?? null,
      input.sessionFile,
      input.cwd ?? "",
      input.title ?? "",
      input.titleDirty ? 1 : 0,
      input.groupId ?? null,
      input.orderNum ?? null,
      input.archived ? 1 : 0,
      input.source ?? "desktop",
      input.messageCount ?? 0,
      input.createTime ?? now,
      input.updateTime ?? input.createTime ?? now
    );
    return this.getById(db, input.id) as ChatSessionRow;
  }

  /** 部分更新：只写传入的字段（标题、分组、置顶、归档、消息数各自独立更新） */
  static update(db: Database.Database, id: string, patch: ChatSessionPatch): ChatSessionRow | null {
    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const [field, column] of Object.entries(COLUMN_BY_FIELD) as Array<
      [keyof ChatSessionPatch, string]
    >) {
      if (patch[field] === undefined) continue;
      assignments.push(`${column} = ?`);
      params.push(toSqlValue(field, patch[field]));
    }
    if (patch.updateTime === undefined) {
      assignments.push("update_time = ?");
      params.push(Date.now());
    }
    if (assignments.length === 0) return this.getById(db, id);
    db.prepare(`UPDATE chat_session SET ${assignments.join(", ")} WHERE id = ?`).run(...params, id);
    return this.getById(db, id);
  }

  static getById(db: Database.Database, id: string): ChatSessionRow | null {
    const row = db.prepare("SELECT * FROM chat_session WHERE id = ?").get(id) as RawRow | undefined;
    return row ? this.parse(row) : null;
  }

  /** 按场景列出会话：置顶（order_num 非空）在前、其余按最近更新降序——与旧列表语义一致 */
  static list(db: Database.Database, filter?: ChatSessionListFilter): ChatSessionRow[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter?.scope) {
      where.push("scope = ?");
      params.push(filter.scope);
    }
    if (filter?.domainRef !== undefined) {
      if (filter.domainRef === null) {
        where.push("domain_ref IS NULL");
      } else {
        where.push("domain_ref = ?");
        params.push(filter.domainRef);
      }
    }
    if (!filter?.includeArchived) where.push("archived = 0");
    const rows = db
      .prepare(
        `SELECT * FROM chat_session
         ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY CASE WHEN order_num IS NULL THEN 1 ELSE 0 END, order_num ASC, update_time DESC
         ${filter?.limit ? "LIMIT ?" : ""}`
      )
      .all(...params, ...(filter?.limit ? [filter.limit] : [])) as RawRow[];
    return rows.map(row => this.parse(row));
  }

  /** 置顶：同组内取最大 order_num + 1（沿用旧表语义，order_num 兼任置顶标记与排序） */
  static pin(db: Database.Database, id: string): ChatSessionRow | null {
    const target = this.getById(db, id);
    if (!target) return null;
    const row = db
      .prepare(
        `SELECT MAX(order_num) AS maxOrder FROM chat_session
         WHERE order_num IS NOT NULL AND scope = ?
           AND ${target.domainRef === null ? "domain_ref IS NULL" : "domain_ref = ?"}`
      )
      .get(...(target.domainRef === null ? [target.scope] : [target.scope, target.domainRef])) as {
      maxOrder: number | null;
    };
    return this.update(db, id, { orderNum: (row?.maxOrder ?? 0) + 1 });
  }

  static unpin(db: Database.Database, id: string): ChatSessionRow | null {
    return this.update(db, id, { orderNum: null });
  }

  /**
   * 删除目录行与它的会话文件（分支都在文件里，一起没了）。
   * 文件在主进程这里一并删，调用方只删目录行就会留下孤儿文件（同步时还会被打包带走）。
   * 调用方负责先释放这个会话的宿主（渲染端删除流程先 dispose）。
   */
  static remove(db: Database.Database, id: string): void {
    const row = this.getById(db, id);
    if (row) this.deleteRows(db, [row]);
  }

  /** 所属对象被删（PDF 等）：该对象下的全部对话连文件一起删 */
  static removeByDomain(db: Database.Database, scope: string, domainRef: string): string[] {
    const rows = (
      db
        .prepare("SELECT * FROM chat_session WHERE scope = ? AND domain_ref = ?")
        .all(scope, domainRef) as RawRow[]
    ).map(row => this.parse(row));
    this.deleteRows(db, rows);
    return rows.map(row => row.id);
  }

  /** 分组被删：对话移到未分组 */
  static clearGroup(db: Database.Database, groupId: number): void {
    db.prepare("UPDATE chat_session SET group_id = NULL WHERE group_id = ?").run(groupId);
  }

  private static deleteRows(db: Database.Database, rows: ChatSessionRow[]): void {
    if (rows.length === 0) return;
    const remove = db.prepare("DELETE FROM chat_session WHERE id = ?");
    for (const row of rows) remove.run(row.id);
    const sessionDir = chatSessionDirOfDb(db);
    if (!sessionDir) return;
    for (const row of rows) {
      try {
        rmSync(resolveSessionFile(sessionDir, row.sessionFile), { force: true });
      } catch (error) {
        console.error("[chat-session] 删除会话文件失败:", row.sessionFile, error);
      }
    }
  }
}
