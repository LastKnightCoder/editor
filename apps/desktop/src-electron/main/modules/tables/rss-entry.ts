import Database from "better-sqlite3";
import {
  CreateRssEntryPayload,
  UpdateRssEntryPayload,
  RssEntry,
} from "@/types";

export default class RssEntryTable {
  static upgradeTable(db: Database.Database) {
    const columns = db.prepare(`PRAGMA table_info(rss_entry)`).all() as Array<{
      name: string;
    }>;
    const hasDeletedColumn = columns.some(
      (column) => column.name === "is_deleted",
    );
    if (!hasDeletedColumn) {
      db.exec(`ALTER TABLE rss_entry ADD COLUMN is_deleted INTEGER DEFAULT 0`);
    }
  }

  static parse(row: Record<string, unknown>): RssEntry {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      feedId: row.feed_id as number,
      guid: row.guid as string,
      title: row.title as string | null,
      url: row.url as string | null,
      author: row.author as string | null,
      description: row.description as string | null,
      content: row.content as string | null,
      readabilityContent: row.readability_content as string | null,
      publishedAt: row.published_at as number | null,
      media: row.media as string | null,
      categories: row.categories as string | null,
      enclosureUrl: row.enclosure_url as string | null,
      enclosureType: row.enclosure_type as string | null,
      enclosureLength: row.enclosure_length as number | null,
      isRead: row.is_read as number,
      isStarred: row.is_starred as number,
      isDeleted: (row.is_deleted as number | undefined) ?? 0,
    };
  }

  static getListenEvents() {
    return {
      "rss-entry:create": this.create.bind(this),
      "rss-entry:upsert": this.upsert.bind(this),
      "rss-entry:update": this.update.bind(this),
      "rss-entry:get": this.getById.bind(this),
      "rss-entry:list-by-feed": this.listByFeed.bind(this),
      "rss-entry:list-by-subscription": this.listBySubscription.bind(this),
      "rss-entry:list-unread": this.listUnread.bind(this),
      "rss-entry:list-starred": this.listStarred.bind(this),
      "rss-entry:list-all": this.listAll.bind(this),
      "rss-entry:list-by-category": this.listByCategory.bind(this),
      "rss-entry:count-by-feed": this.countByFeed.bind(this),
      "rss-entry:count-unread": this.countUnread.bind(this),
      "rss-entry:count-starred": this.countStarred.bind(this),
      "rss-entry:count-all": this.countAll.bind(this),
      "rss-entry:count-by-category": this.countByCategory.bind(this),
      "rss-entry:mark-read": this.markRead.bind(this),
      "rss-entry:mark-unread": this.markUnread.bind(this),
      "rss-entry:mark-all-read-by-feed": this.markAllReadByFeed.bind(this),
      "rss-entry:toggle-star": this.toggleStar.bind(this),
      "rss-entry:delete": this.remove.bind(this),
      "rss-entry:delete-by-feed": this.deleteByFeed.bind(this),
      "rss-entry:get-unread-counts": this.getUnreadCounts.bind(this),
      "rss-entry:get-starred-count": this.getStarredCount.bind(this),
    };
  }

  private static searchCondition(search?: string): {
    clause: string;
    params: string[];
  } {
    const keyword = search?.trim();
    if (!keyword) return { clause: "", params: [] };
    const like = `%${keyword}%`;
    return {
      clause:
        " AND (title LIKE ? OR description LIKE ? OR content LIKE ? OR author LIKE ?)",
      params: [like, like, like, like],
    };
  }

  static create(
    db: Database.Database,
    payload: CreateRssEntryPayload,
  ): RssEntry {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO rss_entry (
        create_time, update_time, feed_id, guid, title, url, author,
        description, content, readability_content, published_at,
        media, categories, enclosure_url, enclosure_type, enclosure_length
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      now,
      now,
      payload.feedId,
      payload.guid,
      payload.title ?? null,
      payload.url ?? null,
      payload.author ?? null,
      payload.description ?? null,
      payload.content ?? null,
      payload.readabilityContent ?? null,
      payload.publishedAt ?? null,
      payload.media ?? null,
      payload.categories ?? null,
      payload.enclosureUrl ?? null,
      payload.enclosureType ?? null,
      payload.enclosureLength ?? null,
    );
    const entry = this.getById(db, Number(res.lastInsertRowid));
    if (!entry) {
      throw new Error("Failed to create rss entry");
    }
    return entry;
  }

  static upsert(
    db: Database.Database,
    payload: CreateRssEntryPayload,
  ): RssEntry | null {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO rss_entry (
        create_time, update_time, feed_id, guid, title, url, author,
        description, content, readability_content, published_at,
        media, categories, enclosure_url, enclosure_type, enclosure_length
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(feed_id, guid) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        author = excluded.author,
        description = excluded.description,
        content = excluded.content,
        readability_content = excluded.readability_content,
        published_at = excluded.published_at,
        media = excluded.media,
        categories = excluded.categories,
        enclosure_url = excluded.enclosure_url,
        enclosure_type = excluded.enclosure_type,
        enclosure_length = excluded.enclosure_length,
        update_time = excluded.update_time
    `);
    const res = stmt.run(
      now,
      now,
      payload.feedId,
      payload.guid,
      payload.title ?? null,
      payload.url ?? null,
      payload.author ?? null,
      payload.description ?? null,
      payload.content ?? null,
      payload.readabilityContent ?? null,
      payload.publishedAt ?? null,
      payload.media ?? null,
      payload.categories ?? null,
      payload.enclosureUrl ?? null,
      payload.enclosureType ?? null,
      payload.enclosureLength ?? null,
    );
    if (res.changes > 0) {
      const row = db
        .prepare(`SELECT * FROM rss_entry WHERE feed_id = ? AND guid = ?`)
        .get(payload.feedId, payload.guid) as
        | Record<string, unknown>
        | undefined;
      return row ? this.parse(row) : null;
    }
    return null;
  }

  static update(
    db: Database.Database,
    payload: UpdateRssEntryPayload,
  ): RssEntry {
    const existing = db
      .prepare(`SELECT * FROM rss_entry WHERE id = ?`)
      .get(payload.id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`RSS entry ${payload.id} not found`);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE rss_entry
      SET title = ?, content = ?, readability_content = ?,
          is_read = ?, is_starred = ?, update_time = ?
      WHERE id = ?
    `);
    stmt.run(
      payload.title ?? existing.title,
      payload.content ?? existing.content,
      payload.readabilityContent !== undefined
        ? payload.readabilityContent
        : existing.readability_content,
      payload.isRead ?? existing.is_read,
      payload.isStarred ?? existing.is_starred,
      now,
      payload.id,
    );
    const entry = this.getById(db, payload.id);
    if (!entry) {
      throw new Error("Failed to update rss entry");
    }
    return entry;
  }

  static getById(db: Database.Database, id: number): RssEntry | null {
    const row = db.prepare(`SELECT * FROM rss_entry WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.parse(row) : null;
  }

  static listByFeed(
    db: Database.Database,
    feedId: number,
    limit = 50,
    offset = 0,
    search = "",
  ): RssEntry[] {
    const searchCondition = this.searchCondition(search);
    const rows = db
      .prepare(
        `SELECT * FROM rss_entry WHERE feed_id = ? AND is_deleted = 0${searchCondition.clause} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
      )
      .all(feedId, ...searchCondition.params, limit, offset) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => this.parse(row));
  }

  static listBySubscription(
    db: Database.Database,
    subscriptionId: number,
    limit = 50,
    offset = 0,
    search = "",
  ): RssEntry[] {
    const searchCondition = this.searchCondition(search);
    const rows = db
      .prepare(
        `SELECT e.* FROM rss_entry e
         JOIN rss_subscription s ON s.feed_id = e.feed_id
         WHERE s.id = ? AND e.is_deleted = 0${searchCondition.clause}
         ORDER BY e.published_at DESC LIMIT ? OFFSET ?`,
      )
      .all(subscriptionId, ...searchCondition.params, limit, offset) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => this.parse(row));
  }

  static listUnread(
    db: Database.Database,
    limit = 50,
    offset = 0,
    search = "",
  ): RssEntry[] {
    const searchCondition = this.searchCondition(search);
    const rows = db
      .prepare(
        `SELECT * FROM rss_entry WHERE is_read = 0 AND is_deleted = 0${searchCondition.clause} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...searchCondition.params, limit, offset) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => this.parse(row));
  }

  static listStarred(
    db: Database.Database,
    limit = 50,
    offset = 0,
    search = "",
  ): RssEntry[] {
    const searchCondition = this.searchCondition(search);
    const rows = db
      .prepare(
        `SELECT * FROM rss_entry WHERE is_starred = 1 AND is_deleted = 0${searchCondition.clause} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...searchCondition.params, limit, offset) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => this.parse(row));
  }

  static listAll(
    db: Database.Database,
    limit = 100,
    offset = 0,
    search = "",
  ): RssEntry[] {
    const searchCondition = this.searchCondition(search);
    const rows = db
      .prepare(
        `SELECT * FROM rss_entry WHERE is_deleted = 0${searchCondition.clause} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...searchCondition.params, limit, offset) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => this.parse(row));
  }

  static listByCategory(
    db: Database.Database,
    category: string,
    limit = 100,
    offset = 0,
    search = "",
  ): RssEntry[] {
    const searchCondition = this.searchCondition(search);
    const rows = db
      .prepare(
        `SELECT e.* FROM rss_entry e
         JOIN rss_subscription s ON s.feed_id = e.feed_id
         WHERE s.category = ? AND e.is_deleted = 0${searchCondition.clause}
         ORDER BY e.published_at DESC LIMIT ? OFFSET ?`,
      )
      .all(category, ...searchCondition.params, limit, offset) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => this.parse(row));
  }

  static countByFeed(
    db: Database.Database,
    feedId: number,
    search = "",
  ): number {
    const searchCondition = this.searchCondition(search);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM rss_entry WHERE feed_id = ? AND is_deleted = 0${searchCondition.clause}`,
      )
      .get(feedId, ...searchCondition.params) as Record<string, unknown>;
    return row.count as number;
  }

  static countUnread(db: Database.Database, search = ""): number {
    const searchCondition = this.searchCondition(search);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM rss_entry WHERE is_read = 0 AND is_deleted = 0${searchCondition.clause}`,
      )
      .get(...searchCondition.params) as Record<string, unknown>;
    return row.count as number;
  }

  static countStarred(db: Database.Database, search = ""): number {
    const searchCondition = this.searchCondition(search);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM rss_entry WHERE is_starred = 1 AND is_deleted = 0${searchCondition.clause}`,
      )
      .get(...searchCondition.params) as Record<string, unknown>;
    return row.count as number;
  }

  static countAll(db: Database.Database, search = ""): number {
    const searchCondition = this.searchCondition(search);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM rss_entry WHERE is_deleted = 0${searchCondition.clause}`,
      )
      .get(...searchCondition.params) as Record<string, unknown>;
    return row.count as number;
  }

  static countByCategory(
    db: Database.Database,
    category: string,
    search = "",
  ): number {
    const searchCondition = this.searchCondition(search);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM rss_entry e
         JOIN rss_subscription s ON s.feed_id = e.feed_id
         WHERE s.category = ? AND e.is_deleted = 0${searchCondition.clause}`,
      )
      .get(category, ...searchCondition.params) as Record<string, unknown>;
    return row.count as number;
  }

  static markRead(db: Database.Database, id: number): number {
    const now = Date.now();
    return db
      .prepare(`UPDATE rss_entry SET is_read = 1, update_time = ? WHERE id = ?`)
      .run(now, id).changes;
  }

  static markUnread(db: Database.Database, id: number): number {
    const now = Date.now();
    return db
      .prepare(`UPDATE rss_entry SET is_read = 0, update_time = ? WHERE id = ?`)
      .run(now, id).changes;
  }

  static markAllReadByFeed(db: Database.Database, feedId: number): number {
    const now = Date.now();
    return db
      .prepare(
        `UPDATE rss_entry SET is_read = 1, update_time = ? WHERE feed_id = ? AND is_read = 0 AND is_deleted = 0`,
      )
      .run(now, feedId).changes;
  }

  static toggleStar(db: Database.Database, id: number): RssEntry | null {
    const now = Date.now();
    db.prepare(
      `UPDATE rss_entry SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END, update_time = ? WHERE id = ?`,
    ).run(now, id);
    return this.getById(db, id);
  }

  static remove(db: Database.Database, id: number): number {
    return db
      .prepare(
        `UPDATE rss_entry SET is_deleted = 1, update_time = ? WHERE id = ?`,
      )
      .run(Date.now(), id).changes;
  }

  static deleteByFeed(db: Database.Database, feedId: number): number {
    return db.prepare(`DELETE FROM rss_entry WHERE feed_id = ?`).run(feedId)
      .changes;
  }

  static getUnreadCounts(
    db: Database.Database,
  ): { feedId: number; count: number }[] {
    const rows = db
      .prepare(
        `SELECT feed_id, COUNT(*) as count FROM rss_entry WHERE is_read = 0 AND is_deleted = 0 GROUP BY feed_id`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((row) => ({
      feedId: row.feed_id as number,
      count: row.count as number,
    }));
  }

  static getStarredCount(db: Database.Database): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) as count FROM rss_entry WHERE is_starred = 1 AND is_deleted = 0`,
      )
      .get() as Record<string, unknown>;
    return row.count as number;
  }
}
