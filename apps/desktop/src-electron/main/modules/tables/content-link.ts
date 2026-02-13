import Database from "better-sqlite3";
import {
  ContentLink,
  ContentLinkSourceType,
  ContentLinkTargetType,
  CreateContentLinkPayload,
  QueryContentLinkPayload,
} from "@/types";

export default class ContentLinkTable {
  static upgradeTable(_db: Database.Database) {
    // placeholder for future migrations
  }

  static parse(row: Record<string, unknown>): ContentLink {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      sourceId: row.source_id as number,
      sourceType: row.source_type as ContentLinkSourceType,
      targetId: row.target_id as number,
      targetType: row.target_type as ContentLinkTargetType,
    };
  }

  static getListenEvents() {
    return {
      "content-link:create": this.create.bind(this),
      "content-link:get": this.getById.bind(this),
      "content-link:query-by-source": this.queryBySource.bind(this),
      "content-link:query-by-target": this.queryByTarget.bind(this),
      "content-link:delete": this.remove.bind(this),
      "content-link:delete-by-source": this.removeBySource.bind(this),
    };
  }

  static create(
    db: Database.Database,
    payload: CreateContentLinkPayload,
  ): ContentLink {
    const now = Date.now();

    // Check if link already exists
    const existing = db
      .prepare(
        `SELECT * FROM content_link WHERE source_id = ? AND source_type = ? AND target_id = ? AND target_type = ?`,
      )
      .get(
        payload.sourceId,
        payload.sourceType,
        payload.targetId,
        payload.targetType,
      ) as Record<string, unknown> | undefined;

    if (existing) {
      return this.parse(existing);
    }

    const stmt = db.prepare(`
      INSERT INTO content_link (create_time, source_id, source_type, target_id, target_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      now,
      payload.sourceId,
      payload.sourceType,
      payload.targetId,
      payload.targetType,
    );
    const contentLink = this.getById(db, Number(res.lastInsertRowid));
    if (!contentLink) {
      throw new Error(`Failed to create content link`);
    }
    return contentLink;
  }

  static getById(db: Database.Database, id: number): ContentLink | null {
    const row = db
      .prepare(`SELECT * FROM content_link WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static queryBySource(
    db: Database.Database,
    payload: QueryContentLinkPayload,
  ): ContentLink[] {
    let sql = `SELECT * FROM content_link WHERE source_id = ? AND source_type = ?`;
    const params: (number | string)[] = [payload.sourceId, payload.sourceType];

    if (payload.targetType) {
      sql += ` AND target_type = ?`;
      params.push(payload.targetType);
    }

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static queryByTarget(
    db: Database.Database,
    targetId: number,
    targetType: ContentLinkTargetType,
  ): ContentLink[] {
    const rows = db
      .prepare(
        `SELECT * FROM content_link WHERE target_id = ? AND target_type = ?`,
      )
      .all(targetId, targetType) as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM content_link WHERE id = ?`);
    return stmt.run(id).changes;
  }

  static removeBySource(
    db: Database.Database,
    sourceId: number,
    sourceType: ContentLinkSourceType,
  ): number {
    const stmt = db.prepare(
      `DELETE FROM content_link WHERE source_id = ? AND source_type = ?`,
    );
    return stmt.run(sourceId, sourceType).changes;
  }
}
