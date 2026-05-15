import Database from "better-sqlite3";
import {
  CreateRssSubscriptionPayload,
  UpdateRssSubscriptionPayload,
  RssSubscription,
} from "@/types";

export default class RssSubscriptionTable {
  static upgradeTable(_db: Database.Database) {
    // placeholder for future migrations
  }

  static parse(row: Record<string, unknown>): RssSubscription {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      feedId: row.feed_id as number,
      title: row.title as string | null,
      category: row.category as string | null,
      viewType: row.view_type as RssSubscription["viewType"],
      isMuted: row.is_muted as number,
    };
  }

  static getListenEvents() {
    return {
      "rss-subscription:create": this.create.bind(this),
      "rss-subscription:update": this.update.bind(this),
      "rss-subscription:get": this.getById.bind(this),
      "rss-subscription:list": this.list.bind(this),
      "rss-subscription:list-by-category": this.listByCategory.bind(this),
      "rss-subscription:get-categories": this.getCategories.bind(this),
      "rss-subscription:delete": this.remove.bind(this),
    };
  }

  static create(
    db: Database.Database,
    payload: CreateRssSubscriptionPayload,
  ): RssSubscription {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO rss_subscription (create_time, update_time, feed_id, title, category, view_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      now,
      now,
      payload.feedId,
      payload.title ?? null,
      payload.category ?? null,
      payload.viewType ?? "article",
    );
    const sub = this.getById(db, Number(res.lastInsertRowid));
    if (!sub) {
      throw new Error("Failed to create rss subscription");
    }
    return sub;
  }

  static update(
    db: Database.Database,
    payload: UpdateRssSubscriptionPayload,
  ): RssSubscription {
    const existing = db
      .prepare(`SELECT * FROM rss_subscription WHERE id = ?`)
      .get(payload.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`RSS subscription ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE rss_subscription
      SET title = ?, category = ?, view_type = ?, is_muted = ?, update_time = ?
      WHERE id = ?
    `);
    stmt.run(
      payload.title !== undefined ? payload.title : existing.title,
      payload.category !== undefined ? payload.category : existing.category,
      payload.viewType ?? existing.view_type,
      payload.isMuted ?? existing.is_muted,
      now,
      payload.id,
    );
    const sub = this.getById(db, payload.id);
    if (!sub) {
      throw new Error("Failed to update rss subscription");
    }
    return sub;
  }

  static getById(db: Database.Database, id: number): RssSubscription | null {
    const row = db
      .prepare(`SELECT * FROM rss_subscription WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.parse(row) : null;
  }

  static list(db: Database.Database): RssSubscription[] {
    const rows = db
      .prepare(`SELECT * FROM rss_subscription ORDER BY create_time DESC`)
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static listByCategory(
    db: Database.Database,
    category: string,
  ): RssSubscription[] {
    const rows = db
      .prepare(
        `SELECT * FROM rss_subscription WHERE category = ? ORDER BY create_time DESC`,
      )
      .all(category) as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static getCategories(db: Database.Database): string[] {
    const rows = db
      .prepare(
        `SELECT DISTINCT category FROM rss_subscription WHERE category IS NOT NULL ORDER BY category`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((row) => row.category as string);
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM rss_subscription WHERE id = ?`);
    return stmt.run(id).changes;
  }
}
