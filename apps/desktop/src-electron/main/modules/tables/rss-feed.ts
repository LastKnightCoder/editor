import Database from "better-sqlite3";
import { CreateRssFeedPayload, UpdateRssFeedPayload, RssFeed } from "@/types";

export default class RssFeedTable {
  static upgradeTable(_db: Database.Database) {
    // placeholder for future migrations
  }

  static parse(row: Record<string, unknown>): RssFeed {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      title: row.title as string,
      description: row.description as string | null,
      url: row.url as string,
      siteUrl: row.site_url as string | null,
      imageUrl: row.image_url as string | null,
      feedType: row.feed_type as RssFeed["feedType"],
      lastFetchedAt: row.last_fetched_at as number | null,
      lastEntryAt: row.last_entry_at as number | null,
      fetchInterval: row.fetch_interval as number,
      errorCount: row.error_count as number,
      lastError: row.last_error as string | null,
      isActive: row.is_active as number,
    };
  }

  static getListenEvents() {
    return {
      "rss-feed:create": this.create.bind(this),
      "rss-feed:update": this.update.bind(this),
      "rss-feed:get": this.getById.bind(this),
      "rss-feed:get-by-url": this.getByUrl.bind(this),
      "rss-feed:list": this.list.bind(this),
      "rss-feed:list-active": this.listActive.bind(this),
      "rss-feed:delete": this.remove.bind(this),
    };
  }

  static create(db: Database.Database, payload: CreateRssFeedPayload): RssFeed {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO rss_feed (create_time, update_time, title, description, url, site_url, image_url, feed_type, fetch_interval)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      now,
      now,
      payload.title,
      payload.description ?? null,
      payload.url,
      payload.siteUrl ?? null,
      payload.imageUrl ?? null,
      payload.feedType ?? "rss",
      payload.fetchInterval ?? 1800000,
    );
    const feed = this.getById(db, Number(res.lastInsertRowid));
    if (!feed) {
      throw new Error("Failed to create rss feed");
    }
    return feed;
  }

  static update(db: Database.Database, payload: UpdateRssFeedPayload): RssFeed {
    const existing = db
      .prepare(`SELECT * FROM rss_feed WHERE id = ?`)
      .get(payload.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`RSS feed ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE rss_feed
      SET title = ?, description = ?, url = ?, site_url = ?, image_url = ?,
          feed_type = ?, last_fetched_at = ?, last_entry_at = ?,
          fetch_interval = ?, error_count = ?, last_error = ?,
          is_active = ?, update_time = ?
      WHERE id = ?
    `);
    stmt.run(
      payload.title ?? existing.title,
      payload.description !== undefined
        ? payload.description
        : existing.description,
      payload.url ?? existing.url,
      payload.siteUrl !== undefined ? payload.siteUrl : existing.site_url,
      payload.imageUrl !== undefined ? payload.imageUrl : existing.image_url,
      payload.feedType ?? existing.feed_type,
      payload.lastFetchedAt !== undefined
        ? payload.lastFetchedAt
        : existing.last_fetched_at,
      payload.lastEntryAt !== undefined
        ? payload.lastEntryAt
        : existing.last_entry_at,
      payload.fetchInterval ?? existing.fetch_interval,
      payload.errorCount ?? existing.error_count,
      payload.lastError !== undefined ? payload.lastError : existing.last_error,
      payload.isActive ?? existing.is_active,
      now,
      payload.id,
    );
    const feed = this.getById(db, payload.id);
    if (!feed) {
      throw new Error("Failed to update rss feed");
    }
    return feed;
  }

  static getById(db: Database.Database, id: number): RssFeed | null {
    const row = db.prepare(`SELECT * FROM rss_feed WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.parse(row) : null;
  }

  static getByUrl(db: Database.Database, url: string): RssFeed | null {
    const row = db.prepare(`SELECT * FROM rss_feed WHERE url = ?`).get(url) as
      | Record<string, unknown>
      | undefined;
    return row ? this.parse(row) : null;
  }

  static list(db: Database.Database): RssFeed[] {
    const rows = db
      .prepare(`SELECT * FROM rss_feed ORDER BY create_time DESC`)
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static listActive(db: Database.Database): RssFeed[] {
    const rows = db
      .prepare(
        `SELECT * FROM rss_feed WHERE is_active = 1 ORDER BY create_time DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.parse(row));
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM rss_feed WHERE id = ?`);
    return stmt.run(id).changes;
  }
}
