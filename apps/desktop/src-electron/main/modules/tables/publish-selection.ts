import Database from "better-sqlite3";
import { IPublishSelection, PublishContentType } from "@/types/publish";

export default class PublishSelectionTable {
  static getListenEvents() {
    return {
      "get-publish-selections": this.getAll.bind(this),
      "get-publish-selections-by-type": this.getByType.bind(this),
      "upsert-publish-selection": this.upsert.bind(this),
      "delete-publish-selection": this.delete.bind(this),
      "clear-publish-selections": this.clearAll.bind(this),
      "batch-upsert-publish-selections": this.batchUpsert.bind(this),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static upgradeTable(_db: Database.Database) {
    // 暂无升级逻辑
  }

  static parseRow(row: Record<string, unknown>): IPublishSelection {
    return {
      id: row.id as number,
      contentType: row.content_type as PublishContentType,
      contentId: row.content_id as number,
      parentPath: (row.parent_path as string) || "",
      selected: (row.selected as number) === 1,
      updateTime: row.update_time as number,
    };
  }

  static getAll(db: Database.Database): IPublishSelection[] {
    const stmt = db.prepare(`
      SELECT * FROM publish_selections 
      WHERE selected = 1 
      ORDER BY content_type, content_id
    `);
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  static getByType(
    db: Database.Database,
    contentType: PublishContentType,
  ): IPublishSelection[] {
    const stmt = db.prepare(`
      SELECT * FROM publish_selections 
      WHERE content_type = ? 
      ORDER BY content_id
    `);
    const rows = stmt.all(contentType) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  static upsert(
    db: Database.Database,
    data: {
      contentType: PublishContentType;
      contentId: number;
      parentPath?: string;
      selected?: boolean;
    },
  ): IPublishSelection {
    const { contentType, contentId, parentPath = "", selected = true } = data;
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO publish_selections (content_type, content_id, parent_path, selected, update_time)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(content_type, content_id) DO UPDATE SET
        parent_path = excluded.parent_path,
        selected = excluded.selected,
        update_time = excluded.update_time
    `);
    stmt.run(contentType, contentId, parentPath, selected ? 1 : 0, now);

    const selectStmt = db.prepare(`
      SELECT * FROM publish_selections 
      WHERE content_type = ? AND content_id = ?
    `);
    const row = selectStmt.get(contentType, contentId) as Record<
      string,
      unknown
    >;
    return this.parseRow(row);
  }

  static batchUpsert(
    db: Database.Database,
    items: Array<{
      contentType: PublishContentType;
      contentId: number;
      parentPath?: string;
      selected?: boolean;
    }>,
  ): void {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO publish_selections (content_type, content_id, parent_path, selected, update_time)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(content_type, content_id) DO UPDATE SET
        parent_path = excluded.parent_path,
        selected = excluded.selected,
        update_time = excluded.update_time
    `);

    const transaction = db.transaction(() => {
      for (const item of items) {
        const {
          contentType,
          contentId,
          parentPath = "",
          selected = true,
        } = item;
        stmt.run(contentType, contentId, parentPath, selected ? 1 : 0, now);
      }
    });

    transaction();
  }

  static delete(
    db: Database.Database,
    contentType: PublishContentType,
    contentId: number,
  ): boolean {
    const stmt = db.prepare(`
      DELETE FROM publish_selections 
      WHERE content_type = ? AND content_id = ?
    `);
    const result = stmt.run(contentType, contentId);
    return result.changes > 0;
  }

  static clearAll(db: Database.Database): void {
    db.exec("DELETE FROM publish_selections");
  }
}
