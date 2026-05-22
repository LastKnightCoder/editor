import Database from "better-sqlite3";
import {
  CreateReadLaterPayload,
  UpdateReadLaterPayload,
  ReadLaterItem,
} from "@/types";

export default class ReadLaterTable {
  static upgradeTable(_db: Database.Database) {
    // placeholder for future migrations
  }

  static parse(row: Record<string, unknown>): ReadLaterItem {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      sourceType: row.source_type as ReadLaterItem["sourceType"],
      sourceId: row.source_id as number | null,
      title: row.title as string,
      url: row.url as string | null,
      excerpt: row.excerpt as string | null,
      content: row.content as string | null,
      isArchived: row.is_archived as number,
      isStarred: row.is_starred as number,
      tags: row.tags as string | null,
      readingProgress: row.reading_progress as number,
    };
  }

  static getListenEvents() {
    return {
      "read-later:add": this.add.bind(this),
      "read-later:update": this.update.bind(this),
      "read-later:get": this.getById.bind(this),
      "read-later:list": this.list.bind(this),
      "read-later:list-starred": this.listStarred.bind(this),
      "read-later:list-archived": this.listArchived.bind(this),
      "read-later:star": this.star.bind(this),
      "read-later:unstar": this.unstar.bind(this),
      "read-later:archive": this.archive.bind(this),
      "read-later:unarchive": this.unarchive.bind(this),
      "read-later:remove": this.remove.bind(this),
      "read-later:check-exists": this.checkExists.bind(this),
      "read-later:remove-by-source": this.removeBySource.bind(this),
      "read-later:get-count": this.getCount.bind(this),
    };
  }

  static add(
    db: Database.Database,
    payload: CreateReadLaterPayload,
  ): ReadLaterItem {
    const now = Date.now();
    if (payload.sourceType === "url" && payload.url) {
      const existing = db
        .prepare(
          `SELECT * FROM read_later WHERE source_type = 'url' AND url = ?`,
        )
        .get(payload.url) as Record<string, unknown> | undefined;
      if (existing) {
        db.prepare(
          `UPDATE read_later
           SET title = ?, excerpt = ?, content = ?, tags = ?, update_time = ?
           WHERE id = ?`,
        ).run(
          payload.title,
          payload.excerpt ?? existing.excerpt,
          payload.content ?? existing.content,
          payload.tags ?? existing.tags,
          now,
          existing.id,
        );
        const item = this.getById(db, existing.id as number);
        if (!item) {
          throw new Error("Failed to update read later item");
        }
        return item;
      }
    }

    const stmt = db.prepare(`
      INSERT INTO read_later (create_time, update_time, source_type, source_id, title, url, excerpt, content, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      now,
      now,
      payload.sourceType,
      payload.sourceId ?? null,
      payload.title,
      payload.url ?? null,
      payload.excerpt ?? null,
      payload.content ?? null,
      payload.tags ?? null,
    );
    const item = this.getById(db, Number(res.lastInsertRowid));
    if (!item) {
      throw new Error("Failed to add read later item");
    }
    return item;
  }

  static update(
    db: Database.Database,
    payload: UpdateReadLaterPayload,
  ): ReadLaterItem {
    const existing = db
      .prepare(`SELECT * FROM read_later WHERE id = ?`)
      .get(payload.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Read later item ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE read_later
      SET title = ?, excerpt = ?, content = ?, is_archived = ?,
          is_starred = ?, tags = ?, reading_progress = ?, update_time = ?
      WHERE id = ?
    `);
    stmt.run(
      payload.title ?? existing.title,
      payload.excerpt !== undefined ? payload.excerpt : existing.excerpt,
      payload.content !== undefined ? payload.content : existing.content,
      payload.isArchived ?? existing.is_archived,
      payload.isStarred ?? existing.is_starred,
      payload.tags !== undefined ? payload.tags : existing.tags,
      payload.readingProgress ?? existing.reading_progress,
      now,
      payload.id,
    );
    const item = this.getById(db, payload.id);
    if (!item) {
      throw new Error("Failed to update read later item");
    }
    return item;
  }

  static getById(db: Database.Database, id: number): ReadLaterItem | null {
    const row = db.prepare(`SELECT * FROM read_later WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.parse(row) : null;
  }

  static list(db: Database.Database, limit = 50, offset = 0): ReadLaterItem[] {
    const rows = db
      .prepare(
        `SELECT * FROM read_later WHERE is_archived = 0 ORDER BY create_time DESC LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static listStarred(
    db: Database.Database,
    limit = 50,
    offset = 0,
  ): ReadLaterItem[] {
    const rows = db
      .prepare(
        `SELECT * FROM read_later WHERE is_starred = 1 AND is_archived = 0 ORDER BY create_time DESC LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static listArchived(
    db: Database.Database,
    limit = 50,
    offset = 0,
  ): ReadLaterItem[] {
    const rows = db
      .prepare(
        `SELECT * FROM read_later WHERE is_archived = 1 ORDER BY update_time DESC LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static star(db: Database.Database, id: number): number {
    const now = Date.now();
    return db
      .prepare(
        `UPDATE read_later SET is_starred = 1, update_time = ? WHERE id = ?`,
      )
      .run(now, id).changes;
  }

  static unstar(db: Database.Database, id: number): number {
    const now = Date.now();
    return db
      .prepare(
        `UPDATE read_later SET is_starred = 0, update_time = ? WHERE id = ?`,
      )
      .run(now, id).changes;
  }

  static archive(db: Database.Database, id: number): number {
    const now = Date.now();
    return db
      .prepare(
        `UPDATE read_later SET is_archived = 1, update_time = ? WHERE id = ?`,
      )
      .run(now, id).changes;
  }

  static unarchive(db: Database.Database, id: number): number {
    const now = Date.now();
    return db
      .prepare(
        `UPDATE read_later SET is_archived = 0, update_time = ? WHERE id = ?`,
      )
      .run(now, id).changes;
  }

  static remove(db: Database.Database, id: number): number {
    return db.prepare(`DELETE FROM read_later WHERE id = ?`).run(id).changes;
  }

  static checkExists(
    db: Database.Database,
    sourceType: string,
    sourceId: number,
  ): boolean {
    const row = db
      .prepare(
        `SELECT id FROM read_later WHERE source_type = ? AND source_id = ? LIMIT 1`,
      )
      .get(sourceType, sourceId);
    return !!row;
  }

  static removeBySource(
    db: Database.Database,
    sourceType: string,
    sourceId: number,
  ): number {
    return db
      .prepare(`DELETE FROM read_later WHERE source_type = ? AND source_id = ?`)
      .run(sourceType, sourceId).changes;
  }

  static getCount(db: Database.Database): number {
    const row = db
      .prepare(`SELECT COUNT(*) as count FROM read_later WHERE is_archived = 0`)
      .get() as Record<string, unknown>;
    return row.count as number;
  }
}
