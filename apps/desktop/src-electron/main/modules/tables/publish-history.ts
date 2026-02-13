import Database from "better-sqlite3";
import { IPublishHistory, PublishContentType } from "@/types/publish";

export default class PublishHistoryTable {
  static getListenEvents() {
    return {
      "get-publish-history": this.getAll.bind(this),
      "get-publish-history-by-path": this.getByPath.bind(this),
      "upsert-publish-history": this.upsert.bind(this),
      "delete-publish-history": this.delete.bind(this),
      "delete-publish-history-by-paths": this.deleteByPaths.bind(this),
      "clear-publish-history": this.clearAll.bind(this),
      "batch-upsert-publish-history": this.batchUpsert.bind(this),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static upgradeTable(_db: Database.Database) {
    // 暂无升级逻辑
  }

  static parseRow(row: Record<string, unknown>): IPublishHistory {
    return {
      id: row.id as number,
      filePath: row.file_path as string,
      contentHash: row.content_hash as string,
      sourceType: row.source_type as PublishContentType,
      sourceId: row.source_id as number,
      publishTime: row.publish_time as number,
    };
  }

  static getAll(db: Database.Database): IPublishHistory[] {
    const stmt = db.prepare(`
      SELECT * FROM publish_history 
      ORDER BY publish_time DESC
    `);
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  static getByPath(
    db: Database.Database,
    filePath: string,
  ): IPublishHistory | null {
    const stmt = db.prepare(`
      SELECT * FROM publish_history 
      WHERE file_path = ?
    `);
    const row = stmt.get(filePath) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.parseRow(row);
  }

  static upsert(
    db: Database.Database,
    data: {
      filePath: string;
      contentHash: string;
      sourceType?: PublishContentType;
      sourceId?: number;
    },
  ): IPublishHistory {
    const { filePath, contentHash, sourceType, sourceId } = data;
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO publish_history (file_path, content_hash, source_type, source_id, publish_time)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        content_hash = excluded.content_hash,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        publish_time = excluded.publish_time
    `);
    stmt.run(filePath, contentHash, sourceType || null, sourceId || null, now);

    const selectStmt = db.prepare(`
      SELECT * FROM publish_history 
      WHERE file_path = ?
    `);
    const row = selectStmt.get(filePath) as Record<string, unknown>;
    return this.parseRow(row);
  }

  static batchUpsert(
    db: Database.Database,
    items: Array<{
      filePath: string;
      contentHash: string;
      sourceType?: PublishContentType;
      sourceId?: number;
    }>,
  ): void {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO publish_history (file_path, content_hash, source_type, source_id, publish_time)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        content_hash = excluded.content_hash,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        publish_time = excluded.publish_time
    `);

    const transaction = db.transaction(() => {
      for (const item of items) {
        const { filePath, contentHash, sourceType, sourceId } = item;
        stmt.run(
          filePath,
          contentHash,
          sourceType || null,
          sourceId || null,
          now,
        );
      }
    });

    transaction();
  }

  static delete(db: Database.Database, filePath: string): boolean {
    const stmt = db.prepare(`
      DELETE FROM publish_history 
      WHERE file_path = ?
    `);
    const result = stmt.run(filePath);
    return result.changes > 0;
  }

  static deleteByPaths(db: Database.Database, filePaths: string[]): number {
    if (filePaths.length === 0) return 0;

    const placeholders = filePaths.map(() => "?").join(",");
    const stmt = db.prepare(`
      DELETE FROM publish_history 
      WHERE file_path IN (${placeholders})
    `);
    const result = stmt.run(...filePaths);
    return result.changes;
  }

  static clearAll(db: Database.Database): void {
    db.exec("DELETE FROM publish_history");
  }
}
