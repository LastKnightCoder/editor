import Database from "better-sqlite3";
import {
  NotionSync,
  CreateNotionSync,
  UpdateNotionSync,
} from "@/types/notion-sync";
import log from "electron-log";

export default class NotionSyncTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notion_sync (
        id INTEGER PRIMARY KEY,
        page_id TEXT NOT NULL UNIQUE,
        sync_mode TEXT NOT NULL,
        code_block_id TEXT,
        last_local_content_hash TEXT,
        pending_sync INTEGER DEFAULT 0,
        last_sync_attempt INTEGER,
        sync_error TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `);

    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notion_sync_page_id ON notion_sync(page_id);
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notion_sync_pending ON notion_sync(pending_sync);
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 未来的表升级逻辑
  }

  static getListenEvents() {
    return {
      "create-notion-sync": this.createNotionSync.bind(this),
      "update-notion-sync": this.updateNotionSync.bind(this),
      "get-notion-sync": this.getNotionSync.bind(this),
      "get-notion-sync-by-page-id": this.getNotionSyncByPageId.bind(this),
      "delete-notion-sync": this.deleteNotionSync.bind(this),
      "get-all-notion-syncs": this.getAllNotionSyncs.bind(this),
      "get-pending-syncs": this.getPendingSyncs.bind(this),
      "mark-as-pending-sync": this.markAsPendingSync.bind(this),
    };
  }

  private static parseNotionSync(row: any): NotionSync {
    return {
      id: row.id,
      pageId: row.page_id,
      syncMode: row.sync_mode as "bidirectional" | "json",
      codeBlockId: row.code_block_id || undefined,
      lastLocalContentHash: row.last_local_content_hash || undefined,
      pendingSync: Boolean(row.pending_sync),
      lastSyncAttempt: row.last_sync_attempt || undefined,
      syncError: row.sync_error || undefined,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static createNotionSync(
    db: Database.Database,
    data: CreateNotionSync,
  ): NotionSync {
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO notion_sync (
        page_id,
        sync_mode,
        code_block_id,
        last_local_content_hash,
        pending_sync,
        last_sync_attempt,
        sync_error,
        create_time,
        update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.pageId,
      data.syncMode,
      data.codeBlockId || null,
      data.lastLocalContentHash || null,
      data.pendingSync ? 1 : 0,
      data.lastSyncAttempt || null,
      data.syncError || null,
      now,
      now,
    );

    log.info(`创建 NotionSync 记录: ${result.lastInsertRowid}`);

    return this.getNotionSync(db, Number(result.lastInsertRowid))!;
  }

  static updateNotionSync(
    db: Database.Database,
    id: number,
    data: UpdateNotionSync,
  ): NotionSync | null {
    const existing = this.getNotionSync(db, id);
    if (!existing) {
      log.warn(`NotionSync 记录不存在: ${id}`);
      return null;
    }

    const now = Date.now();
    const fields: string[] = [];
    const values: any[] = [];

    if (data.pageId !== undefined) {
      fields.push("page_id = ?");
      values.push(data.pageId);
    }
    if (data.syncMode !== undefined) {
      fields.push("sync_mode = ?");
      values.push(data.syncMode);
    }
    if (data.codeBlockId !== undefined) {
      fields.push("code_block_id = ?");
      values.push(data.codeBlockId);
    }
    if (data.lastLocalContentHash !== undefined) {
      fields.push("last_local_content_hash = ?");
      values.push(data.lastLocalContentHash);
    }
    if (data.pendingSync !== undefined) {
      fields.push("pending_sync = ?");
      values.push(data.pendingSync ? 1 : 0);
    }
    if (data.lastSyncAttempt !== undefined) {
      fields.push("last_sync_attempt = ?");
      values.push(data.lastSyncAttempt);
    }
    if (data.syncError !== undefined) {
      fields.push("sync_error = ?");
      values.push(data.syncError);
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push("update_time = ?");
    values.push(now);
    values.push(id);

    const stmt = db.prepare(`
      UPDATE notion_sync
      SET ${fields.join(", ")}
      WHERE id = ?
    `);

    stmt.run(...values);

    log.info(`更新 NotionSync 记录: ${id}`);

    return this.getNotionSync(db, id);
  }

  static getNotionSync(db: Database.Database, id: number): NotionSync | null {
    const stmt = db.prepare("SELECT * FROM notion_sync WHERE id = ?");
    const row = stmt.get(id);

    if (!row) {
      return null;
    }

    return this.parseNotionSync(row);
  }

  static getNotionSyncByPageId(
    db: Database.Database,
    pageId: string,
  ): NotionSync | null {
    const stmt = db.prepare("SELECT * FROM notion_sync WHERE page_id = ?");
    const row = stmt.get(pageId);

    if (!row) {
      return null;
    }

    return this.parseNotionSync(row);
  }

  static deleteNotionSync(db: Database.Database, id: number): boolean {
    const stmt = db.prepare("DELETE FROM notion_sync WHERE id = ?");
    const result = stmt.run(id);

    log.info(`删除 NotionSync 记录: ${id}`);

    return result.changes > 0;
  }

  static getAllNotionSyncs(db: Database.Database): NotionSync[] {
    const stmt = db.prepare(
      "SELECT * FROM notion_sync ORDER BY update_time DESC",
    );
    const rows = stmt.all();

    return rows.map((row) => this.parseNotionSync(row));
  }

  static getPendingSyncs(db: Database.Database): NotionSync[] {
    const stmt = db.prepare(
      "SELECT * FROM notion_sync WHERE pending_sync = 1 ORDER BY update_time ASC",
    );
    const rows = stmt.all();

    return rows.map((row) => this.parseNotionSync(row));
  }

  static markAsPendingSync(
    db: Database.Database,
    id: number,
    pending = true,
  ): boolean {
    const stmt = db.prepare(`
      UPDATE notion_sync
      SET pending_sync = ?, update_time = ?
      WHERE id = ?
    `);

    const result = stmt.run(pending ? 1 : 0, Date.now(), id);

    return result.changes > 0;
  }
}
