import Database from "better-sqlite3";
import { CreateWebLinkPayload, UpdateWebLinkPayload, WebLink, WebLinkSourceType } from "@/types";
import type { SqliteRow } from "../../types/table";

export default class WebLinkTable {
  static parse(row: SqliteRow): WebLink {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      title: row.title as string,
      url: row.url as string,
      sourceType: row.source_type as WebLinkSourceType,
    };
  }

  static getListenEvents() {
    return {
      "web-link:create": this.create.bind(this),
      "web-link:update": this.update.bind(this),
      "web-link:get": this.getById.bind(this),
      "web-link:list-by-ids": this.listByIds.bind(this),
      "web-link:delete": this.remove.bind(this),
    };
  }

  static create(db: Database.Database, payload: CreateWebLinkPayload): WebLink {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO web_link (create_time, update_time, title, url, source_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(now, now, payload.title, payload.url, payload.sourceType);
    const webLink = this.getById(db, Number(res.lastInsertRowid));
    if (!webLink) {
      throw new Error(`Failed to create web link`);
    }
    return webLink;
  }

  static update(db: Database.Database, payload: UpdateWebLinkPayload): WebLink {
    const existing = db.prepare(`SELECT * FROM web_link WHERE id = ?`).get(payload.id) as {
      id: number;
      title: string;
      url: string;
      source_type: WebLinkSourceType;
    };
    if (!existing) {
      throw new Error(`Web link ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE web_link
      SET title = ?, url = ?, source_type = ?, update_time = ?
      WHERE id = ?
    `);
    stmt.run(
      payload.title ?? existing.title,
      payload.url ?? existing.url,
      payload.sourceType ?? existing.source_type,
      now,
      payload.id
    );
    const webLink = this.getById(db, payload.id);
    if (!webLink) {
      throw new Error(`Failed to update web link`);
    }
    return webLink;
  }

  static getById(db: Database.Database, id: number): WebLink | null {
    const row = db.prepare(`SELECT * FROM web_link WHERE id = ?`).get(id) as SqliteRow | undefined;
    return row ? this.parse(row) : null;
  }

  static listByIds(db: Database.Database, ids: number[]): WebLink[] {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT * FROM web_link WHERE id IN (${placeholders})`)
      .all(...ids) as SqliteRow[];
    return rows.map(row => this.parse(row));
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM web_link WHERE id = ?`);
    return stmt.run(id).changes;
  }
}
