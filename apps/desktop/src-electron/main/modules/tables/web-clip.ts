import Database from "better-sqlite3";
import { CreateWebClipPayload, UpdateWebClipPayload, WebClip } from "@/types";

export default class WebClipTable {
  static parse(row: Record<string, unknown>): WebClip {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      contentId: row.content_id as number,
      url: row.url as string,
      title: row.title as string,
    };
  }

  static getListenEvents() {
    return {
      "web-clip:create": this.create.bind(this),
      "web-clip:update": this.update.bind(this),
      "web-clip:get": this.getById.bind(this),
      "web-clip:get-by-content-id": this.getByContentId.bind(this),
      "web-clip:list-by-ids": this.listByIds.bind(this),
      "web-clip:delete": this.remove.bind(this),
    };
  }

  static create(db: Database.Database, payload: CreateWebClipPayload): WebClip {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO web_clip (create_time, update_time, content_id, url, title)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(now, now, payload.contentId, payload.url, payload.title);
    const webClip = this.getById(db, Number(res.lastInsertRowid));
    if (!webClip) {
      throw new Error(`Failed to create web clip`);
    }
    return webClip;
  }

  static update(db: Database.Database, payload: UpdateWebClipPayload): WebClip {
    const existing = db.prepare(`SELECT * FROM web_clip WHERE id = ?`).get(payload.id) as
      Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Web clip ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE web_clip
      SET content_id = ?, url = ?, title = ?, update_time = ?
      WHERE id = ?
    `);
    stmt.run(
      payload.contentId ?? existing.content_id,
      payload.url ?? existing.url,
      payload.title ?? existing.title,
      now,
      payload.id
    );
    const webClip = this.getById(db, payload.id);
    if (!webClip) {
      throw new Error(`Failed to update web clip`);
    }
    return webClip;
  }

  static getById(db: Database.Database, id: number): WebClip | null {
    const row = db.prepare(`SELECT * FROM web_clip WHERE id = ?`).get(id) as
      Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static getByContentId(db: Database.Database, contentId: number): WebClip | null {
    const row = db.prepare(`SELECT * FROM web_clip WHERE content_id = ?`).get(contentId) as
      Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static listByIds(db: Database.Database, ids: number[]): WebClip[] {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT * FROM web_clip WHERE id IN (${placeholders})`)
      .all(...ids) as Record<string, unknown>[];
    return rows.map(row => this.parse(row));
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM web_clip WHERE id = ?`);
    return stmt.run(id).changes;
  }
}
